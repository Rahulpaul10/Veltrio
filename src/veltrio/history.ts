import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { Amount } from '@/onchain-money'
import { ACTIVE_CHAIN_ID, HISTORY_MODE, INDEXER_API, USDC_ADDRESS } from './network'
import { fetchHistoryFromRpc } from './rpcHistory'
import { useTrackedTxs, type TrackedTx } from './txStore'

/**
 * Wallet history comes from the Arc explorer's public indexer API (Blockscout v2).
 * A plain RPC node cannot list an address's past transactions, so this is the source
 * for history and for every statistic derived from it.
 */

export type Direction = 'out' | 'in' | 'self' | 'none'
export type ItemStatus = 'success' | 'failed' | 'pending'

export interface HistoryItem {
  id: string
  hash: string
  /** transfer: a direct USDC transfer. contract: anything else (swaps, approvals, contract calls). */
  category: 'transfer' | 'contract'
  direction: Direction
  status: ItemStatus
  /** USDC amount in the 6-decimal ERC-20 view, when the item moves USDC. */
  amount: Amount | null
  from: string
  to: string
  timestamp: number
  /** Network fee in the 18-decimal gas view. Only set when this wallet paid it. */
  fee: Amount | null
  method: string | null
  source: 'indexer' | 'rpc' | 'local'
}

export interface HistoryResult {
  items: HistoryItem[]
  /** True when every record for this address was loaded. False means older records exist. */
  complete: boolean
  /** Oldest moment fully covered when history is limited (ms). */
  coverageFrom: number | null
  fetchedAt: number
  /** Where the records came from. */
  source: 'indexer' | 'rpc'
  /** False when reverted transactions cannot be listed (RPC-only history). */
  failedVisible: boolean
}

interface Addr {
  hash: string
}
interface RawTx {
  hash: string
  status: string | null
  result?: string
  timestamp: string | null
  value: string
  method: string | null
  from: Addr
  to: (Addr & { is_contract?: boolean }) | null
  fee?: { value: string } | null
  transaction_types?: string[]
  decoded_input?: { method_call?: string; parameters?: { name: string; value: string }[] } | null
}
interface RawTransfer {
  transaction_hash: string
  log_index: number
  method: string | null
  timestamp: string
  from: Addr
  to: Addr
  total: { value: string | null }
}
interface Page<T> {
  items: T[]
  next_page_params: Record<string, string | number> | null
}

const MAX_PAGES = 4
const GAS_DECIMALS = 18
const USDC_DECIMALS = 6

export class HistoryError extends Error {
  rateLimited: boolean
  constructor(message: string, rateLimited = false) {
    super(message)
    this.name = 'HistoryError'
    this.rateLimited = rateLimited
  }
}

async function fetchPage<T>(url: string, signal?: AbortSignal): Promise<Page<T>> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new HistoryError('Could not reach the explorer indexer.')
  }
  if (response.status === 429) throw new HistoryError('The explorer indexer is rate limiting requests. Try again in a moment.', true)
  if (!response.ok) throw new HistoryError(`The explorer indexer returned an error (${response.status}).`)
  return (await response.json()) as Page<T>
}

interface Feed<T> {
  items: T[]
  complete: boolean
  oldest: number | null
}

async function fetchFeed<T extends { timestamp: string | null }>(base: string, signal?: AbortSignal): Promise<Feed<T>> {
  const items: T[] = []
  let params: Record<string, string | number> | null = null
  let pages = 0
  while (pages < MAX_PAGES) {
    const url = new URL(base)
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    const page: Page<T> = await fetchPage<T>(url.toString(), signal)
    items.push(...page.items)
    pages += 1
    params = page.next_page_params
    if (!params) break
  }
  const times = items.map((i) => (i.timestamp ? Date.parse(i.timestamp) : NaN)).filter((n) => !Number.isNaN(n))
  return { items, complete: !params, oldest: times.length ? Math.min(...times) : null }
}

const lower = (s: string | undefined | null) => (s ?? '').toLowerCase()
const safeBig = (v: string | null | undefined): bigint => {
  try {
    return v ? BigInt(v) : 0n
  } catch {
    return 0n
  }
}
/** The indexer reports a decoded name when it knows the ABI, otherwise the raw 4-byte selector. */
const isTransferMethod = (m: string | null | undefined) => m === 'transfer' || m === '0xa9059cbb'
const readableMethod = (m: string | null) => (m && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(m) ? m : null)

function isPlainNativeTransfer(tx: RawTx): boolean {
  const types = tx.transaction_types ?? []
  return safeBig(tx.value) > 0n && types.includes('coin_transfer') && !types.includes('contract_call') && !types.includes('contract_creation')
}

export async function fetchHistory(address: string, signal?: AbortSignal): Promise<HistoryResult> {
  if (!INDEXER_API) throw new HistoryError('No indexer is configured for this network.')
  const me = lower(address)
  const [txFeed, trFeed] = await Promise.all([
    fetchFeed<RawTx>(`${INDEXER_API}/addresses/${address}/transactions`, signal),
    fetchFeed<RawTransfer>(`${INDEXER_API}/addresses/${address}/token-transfers?type=ERC-20&token=${USDC_ADDRESS}`, signal),
  ])

  const txByHash = new Map(txFeed.items.map((t) => [lower(t.hash), t]))
  const transfersByHash = new Map<string, RawTransfer[]>()
  for (const row of trFeed.items) {
    const key = lower(row.transaction_hash)
    transfersByHash.set(key, [...(transfersByHash.get(key) ?? []), row])
  }

  const items: HistoryItem[] = []

  const directionOf = (from: string, to: string): Direction => {
    const f = lower(from) === me
    const t = lower(to) === me
    if (f && t) return 'self'
    if (f) return 'out'
    if (t) return 'in'
    return 'none'
  }
  const feeOf = (tx: RawTx | undefined): Amount | null =>
    tx && lower(tx.from.hash) === me && tx.fee?.value ? Amount.fromRaw(safeBig(tx.fee.value), GAS_DECIMALS) : null
  const statusOf = (tx: RawTx | undefined): ItemStatus => (tx && (tx.status === 'error' || tx.result === 'reverted') ? 'failed' : 'success')

  // 1) USDC Transfer events (authoritative for amounts of successful transfers).
  for (const row of trFeed.items) {
    const tx = txByHash.get(lower(row.transaction_hash))
    const direct = isTransferMethod(row.method) || (tx ? isPlainNativeTransfer(tx) : false)
    const direction = directionOf(row.from.hash, row.to.hash)
    items.push({
      id: `${row.transaction_hash}:${row.log_index}`,
      hash: row.transaction_hash,
      category: direct ? 'transfer' : 'contract',
      direction,
      status: statusOf(tx),
      amount: Amount.fromRaw(safeBig(row.total.value), USDC_DECIMALS),
      from: row.from.hash,
      to: row.to.hash,
      timestamp: Date.parse(row.timestamp),
      fee: feeOf(tx),
      method: readableMethod(row.method),
      source: 'indexer',
    })
  }

  // 2) Transactions this wallet sent or received that have no USDC Transfer event.
  for (const tx of txFeed.items) {
    const key = lower(tx.hash)
    if (transfersByHash.has(key) || !tx.timestamp) continue
    const timestamp = Date.parse(tx.timestamp)
    const status = statusOf(tx)
    const base = {
      id: tx.hash,
      hash: tx.hash,
      status,
      from: tx.from.hash,
      to: tx.to?.hash ?? '',
      timestamp,
      fee: feeOf(tx),
      source: 'indexer' as const,
    }
    if (isPlainNativeTransfer(tx)) {
      // Native value transfer (Arc's gas token is USDC). 18 -> 6 decimals; sub-micro dust is dropped.
      const amount = Amount.fromRaw(safeBig(tx.value), GAS_DECIMALS).toDecimals(USDC_DECIMALS, 'trunc')
      items.push({ ...base, category: 'transfer', direction: directionOf(tx.from.hash, tx.to?.hash ?? ''), amount, method: null })
      continue
    }
    if (isTransferMethod(tx.method) && lower(tx.to?.hash) === lower(USDC_ADDRESS)) {
      // A transfer() call with no Transfer event: it failed. Show the attempted amount, clearly as failed.
      const params = tx.decoded_input?.parameters ?? []
      const recipient = params.find((p) => p.name === 'to')?.value ?? ''
      const value = params.find((p) => p.name === 'value')?.value
      items.push({
        ...base,
        category: 'transfer',
        direction: 'out',
        to: recipient || base.to,
        amount: value ? Amount.fromRaw(safeBig(value), USDC_DECIMALS) : null,
        method: 'transfer',
      })
      continue
    }
    items.push({ ...base, category: 'contract', direction: 'none', amount: null, method: readableMethod(tx.method) })
  }

  // Both feeds are newest-first and capped. Only report what both cover, so no total is silently partial.
  const incomplete = [txFeed, trFeed].filter((f) => !f.complete)
  const complete = incomplete.length === 0
  const cutoffs = incomplete.map((f) => f.oldest).filter((n): n is number => n !== null)
  const coverageFrom = complete ? null : cutoffs.length ? Math.max(...cutoffs) : null
  const covered = coverageFrom === null ? items : items.filter((i) => i.timestamp > coverageFrom)
  covered.sort((a, b) => b.timestamp - a.timestamp)

  return { items: covered, complete, coverageFrom, fetchedAt: Date.now(), source: 'indexer', failedVisible: true }
}

function localToItem(tx: TrackedTx): HistoryItem {
  return {
    id: `local:${tx.hash}`,
    hash: tx.hash,
    category: 'transfer',
    direction: 'out',
    status: tx.status === 'pending' ? 'pending' : tx.status === 'confirmed' ? 'success' : 'failed',
    amount: Amount.fromRaw(BigInt(tx.amountRaw), USDC_DECIMALS),
    from: tx.from,
    to: tx.to,
    timestamp: tx.resolvedAt ?? tx.submittedAt,
    fee: tx.feeRaw ? Amount.fromRaw(BigInt(tx.feeRaw), GAS_DECIMALS) : null,
    method: 'transfer',
    source: 'local',
  }
}

export function useHistory(address: string | undefined) {
  const tracked = useTrackedTxs(address)
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID })
  const query = useQuery({
    queryKey: ['veltrio', 'history', ACTIVE_CHAIN_ID, HISTORY_MODE, address?.toLowerCase()],
    queryFn: ({ signal }) =>
      HISTORY_MODE === 'rpc'
        ? fetchHistoryFromRpc(client as NonNullable<typeof client>, address as `0x${string}`)
        : fetchHistory(address as string, signal),
    enabled: Boolean(address) && (HISTORY_MODE === 'indexer' || Boolean(client)),
    staleTime: HISTORY_MODE === 'rpc' ? 60_000 : 15_000,
    refetchInterval: HISTORY_MODE === 'rpc' ? 90_000 : 30_000,
    retry: 1,
  })

  const merged = useMemo(() => {
    const indexed = query.data?.items ?? []
    const known = new Set(indexed.map((i) => i.hash.toLowerCase()))
    // Local records only fill in what the indexer has not shown yet (pending, or just confirmed).
    const local = tracked.filter((t) => !known.has(t.hash.toLowerCase())).map(localToItem)
    return [...local, ...indexed].sort((a, b) => b.timestamp - a.timestamp)
  }, [query.data, tracked])

  return {
    items: merged,
    complete: query.data?.complete ?? false,
    coverageFrom: query.data?.coverageFrom ?? null,
    fetchedAt: query.data?.fetchedAt ?? null,
    source: query.data?.source ?? (HISTORY_MODE === 'rpc' ? 'rpc' : 'indexer'),
    failedVisible: query.data?.failedVisible ?? HISTORY_MODE !== 'rpc',
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    hasData: Boolean(query.data),
  }
}

export interface ActivityStats {
  totalTransactions: number
  successful: number
  failed: number
  sentCount: number
  receivedCount: number
  otherCount: number
  sent: Amount
  received: Amount
}

/** Counts each transaction hash once. Totals use only direct USDC transfers that actually succeeded. */
export function computeStats(items: HistoryItem[]): ActivityStats {
  const statusByHash = new Map<string, ItemStatus>()
  for (const i of items) {
    const key = i.hash.toLowerCase()
    const prev = statusByHash.get(key)
    // A hash is failed if any of its records is failed; pending beats success.
    if (!prev || i.status === 'failed' || (i.status === 'pending' && prev === 'success')) statusByHash.set(key, i.status)
  }
  let sent = Amount.zero(USDC_DECIMALS)
  let received = Amount.zero(USDC_DECIMALS)
  let sentCount = 0
  let receivedCount = 0
  let otherCount = 0
  for (const i of items) {
    if (i.status !== 'success' || !i.amount) {
      if (i.category === 'contract') otherCount += 1
      continue
    }
    if (i.category !== 'transfer') {
      otherCount += 1
      continue
    }
    if (i.direction === 'out') {
      sent = sent.add(i.amount)
      sentCount += 1
    } else if (i.direction === 'in') {
      received = received.add(i.amount)
      receivedCount += 1
    }
  }
  const statuses = [...statusByHash.values()]
  return {
    totalTransactions: statusByHash.size,
    successful: statuses.filter((s) => s === 'success').length,
    failed: statuses.filter((s) => s === 'failed').length,
    sentCount,
    receivedCount,
    otherCount,
    sent,
    received,
  }
}
