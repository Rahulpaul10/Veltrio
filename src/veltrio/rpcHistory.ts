import { decodeFunctionData, erc20Abi, parseAbiItem, type PublicClient } from 'viem'
import { Amount } from '@/onchain-money'
import { USDC_ADDRESS } from './network'
import type { Direction, HistoryItem, HistoryResult } from './history'

/**
 * RPC-only history for Arc Mainnet. No third-party service and no API key.
 *
 * Arc logs every explicit USDC movement (native sends and ERC-20 transfers) from one system
 * emitter at 18 decimals (docs.arc.io: USDC system events, EIP-7708). We read those logs for
 * the connected address over a bounded lookback window and then load each transaction.
 *
 * Honest limits, all surfaced in the UI:
 *  - Only a recent window is scanned; the RPC rejects very large block ranges.
 *  - Reverted transactions emit no logs, so failed transactions cannot be listed from RPC.
 *  - Contract-internal native movements without a Transfer log are not visible.
 */

const SYSTEM_EMITTER = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE' as const
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

/** The mainnet RPC accepted 9,999-block ranges and rejected 10,000 when measured on 2026-10-29. */
export const RPC_CHUNK_BLOCKS = 9_000n
/** Kept small on purpose: the public RPC rate-limits bursts of log queries (measured 2026-10-29). */
export const RPC_MAX_CHUNKS = 12
const MAX_TX = 60
const CONCURRENCY = 2

type Client = PublicClient

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase()

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function retry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      last = error
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
  }
  throw last
}

interface RawLog {
  hash: `0x${string}`
  block: bigint
  index: number
  from: string
  to: string
  value: bigint
}

export async function fetchHistoryFromRpc(client: Client, address: `0x${string}`): Promise<HistoryResult> {
  const me = lower(address)
  const head = await client.getBlockNumber()
  const scanFrom = head >= RPC_CHUNK_BLOCKS * BigInt(RPC_MAX_CHUNKS) ? head - RPC_CHUNK_BLOCKS * BigInt(RPC_MAX_CHUNKS) + 1n : 0n

  const ranges: { from: bigint; to: bigint }[] = []
  for (let i = 0; i < RPC_MAX_CHUNKS; i++) {
    const to = head - RPC_CHUNK_BLOCKS * BigInt(i)
    if (to < scanFrom) break
    const from = to - RPC_CHUNK_BLOCKS + 1n > scanFrom ? to - RPC_CHUNK_BLOCKS + 1n : scanFrom
    ranges.push({ from, to })
  }

  const jobs = ranges.flatMap((r) => [
    { ...r, side: 'from' as const },
    { ...r, side: 'to' as const },
  ])
  const batches = await pool(jobs, CONCURRENCY, (job) =>
    retry(() =>
      client.getLogs({
        address: SYSTEM_EMITTER,
        event: TRANSFER_EVENT,
        args: job.side === 'from' ? { from: address } : { to: address },
        fromBlock: job.from,
        toBlock: job.to,
      }),
    ),
  )

  const seen = new Set<string>()
  const logs: RawLog[] = []
  for (const batch of batches) {
    for (const l of batch) {
      if (!l.transactionHash || l.blockNumber === null || l.logIndex === null) continue
      const key = `${l.transactionHash}:${l.logIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      logs.push({ hash: l.transactionHash, block: l.blockNumber, index: l.logIndex, from: l.args.from ?? '', to: l.args.to ?? '', value: l.args.value ?? 0n })
    }
  }

  // Newest transactions first; if there are too many, only keep a window we can describe completely.
  const firstSeenBlock = new Map<string, bigint>()
  for (const l of logs) {
    const prev = firstSeenBlock.get(l.hash)
    if (prev === undefined || l.block > prev) firstSeenBlock.set(l.hash, l.block)
  }
  const hashesNewestFirst = [...firstSeenBlock.entries()].sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1)).map(([h]) => h as `0x${string}`)
  let cutoffBlock: bigint | null = null
  let kept = hashesNewestFirst
  if (hashesNewestFirst.length > MAX_TX) {
    cutoffBlock = firstSeenBlock.get(hashesNewestFirst[MAX_TX]) ?? null
    kept = hashesNewestFirst.slice(0, MAX_TX).filter((h) => cutoffBlock === null || (firstSeenBlock.get(h) ?? 0n) > cutoffBlock)
  }
  const keptSet = new Set(kept)

  const blockTimes = new Map<bigint, number>()
  const timeOf = async (block: bigint) => {
    const cached = blockTimes.get(block)
    if (cached !== undefined) return cached
    const b = await retry(() => client.getBlock({ blockNumber: block }))
    const ms = Number(b.timestamp) * 1000
    blockTimes.set(block, ms)
    return ms
  }

  const directionOf = (from: string, to: string): Direction => {
    const f = lower(from) === me
    const t = lower(to) === me
    if (f && t) return 'self'
    if (f) return 'out'
    if (t) return 'in'
    return 'none'
  }

  const perTx = await pool(kept, CONCURRENCY, async (hash): Promise<HistoryItem[]> => {
    const [tx, receipt] = await Promise.all([retry(() => client.getTransaction({ hash })), retry(() => client.getTransactionReceipt({ hash }))])
    const timestamp = await timeOf(receipt.blockNumber)
    const status = receipt.status === 'success' ? ('success' as const) : ('failed' as const)
    const fee = lower(tx.from) === me ? Amount.fromRaw(receipt.gasUsed * receipt.effectiveGasPrice, 18) : null

    let direct: { payer: string; payee: string; amount: Amount; method: string | null } | null = null
    let method: string | null = null
    if (lower(tx.to) === lower(USDC_ADDRESS)) {
      try {
        const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input })
        method = decoded.functionName
        if (decoded.functionName === 'transfer') {
          direct = { payer: tx.from, payee: decoded.args[0], amount: Amount.fromRaw(decoded.args[1], 6), method: 'transfer' }
        }
      } catch {
        // Unrecognised call data on the USDC contract: treat as a contract interaction.
      }
    } else if (tx.input === '0x' && tx.value > 0n && tx.to) {
      direct = { payer: tx.from, payee: tx.to, amount: Amount.fromRaw(tx.value, 18).toDecimals(6, 'trunc'), method: null }
    }

    if (direct) {
      return [
        {
          id: hash,
          hash,
          category: 'transfer',
          direction: directionOf(direct.payer, direct.payee),
          status,
          amount: direct.amount,
          from: direct.payer,
          to: direct.payee,
          timestamp,
          fee,
          method: direct.method,
          source: 'rpc',
        },
      ]
    }
    return logs
      .filter((l) => l.hash === hash)
      .map((l) => ({
        id: `${hash}:${l.index}`,
        hash,
        category: 'contract' as const,
        direction: directionOf(l.from, l.to),
        status,
        amount: Amount.fromRaw(l.value, 18).toDecimals(6, 'trunc'),
        from: l.from,
        to: l.to,
        timestamp,
        fee,
        method,
        source: 'rpc' as const,
      }))
  })

  const items = perTx.flat().filter((i) => keptSet.has(i.hash as `0x${string}`))
  items.sort((a, b) => b.timestamp - a.timestamp)

  const coverageBlock = cutoffBlock !== null ? cutoffBlock : scanFrom
  const coverageFrom = await timeOf(coverageBlock).catch(() => null)
  // Scanning to genesis would be a full history; otherwise the window is always limited.
  const complete = cutoffBlock === null && scanFrom === 0n

  return { items, complete, coverageFrom: complete ? null : coverageFrom, fetchedAt: Date.now(), source: 'rpc', failedVisible: false }
}
