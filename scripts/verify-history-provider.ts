/**
 * Verification harness for a candidate Arc Mainnet history provider. It does NOT integrate anything
 * into the app. Read-only: no wallet, no signing, no transactions.
 *
 *   ALCHEMY_API_KEY=<your own key> bun run verify:history-provider 0xYourAddress
 *
 * It compares the provider's answer with ground truth read straight from the Arc RPC over the same
 * recent block window (the window the RPC will serve), and reports transactions the provider is
 * missing, extra ones, and duplicate records per transaction. A pass proves completeness only for
 * that window, not for all history. The key is read from the environment only and is never printed.
 *
 * Status: written from Alchemy's public documentation (alchemy_getAssetTransfers, host
 * https://arc-mainnet.g.alchemy.com/v2/{apiKey}). It has NOT been run against the real service,
 * because no key was available when it was written.
 */
import { createPublicClient, http, isAddress, toHex } from 'viem'
import { fetchHistoryFromRpc, RPC_CHUNK_BLOCKS, RPC_MAX_CHUNKS } from '../src/veltrio/rpcHistory'
import { VERIFIED_NETWORKS } from '../src/veltrio/network'

const address = process.argv[2]
const key = process.env.ALCHEMY_API_KEY
if (!address || !isAddress(address) || !key) {
  console.log('Usage: ALCHEMY_API_KEY=<your key> bun run verify:history-provider 0xAddress')
  console.log('Pick an address with some recent USDC activity on Arc Mainnet. Nothing is sent; the key is not stored.')
  process.exit(2)
}

interface Transfer {
  hash: string
  category: string
  asset: string | null
  value: number | null
  uniqueId: string
}

async function alchemy(params: Record<string, unknown>): Promise<{ transfers: Transfer[]; pageKey?: string }> {
  const res = await fetch(`https://arc-mainnet.g.alchemy.com/v2/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
  })
  const body = (await res.json()) as { result?: { transfers: Transfer[]; pageKey?: string }; error?: { message: string } }
  if (!res.ok || body.error || !body.result) throw new Error(`provider error: ${body.error?.message ?? res.status}`)
  return body.result
}

const rpc = createPublicClient({ transport: http(VERIFIED_NETWORKS.mainnet.rpcUrl) })
const head = await rpc.getBlockNumber()
const fromBlock = head - RPC_CHUNK_BLOCKS * BigInt(RPC_MAX_CHUNKS) + 1n
console.log(`Window: blocks ${fromBlock} to ${head}`)

const truth = await fetchHistoryFromRpc(rpc, address)
const truthHashes = new Set(truth.items.map((i) => i.hash.toLowerCase()))

const seen = new Map<string, Transfer[]>()
for (const side of ['fromAddress', 'toAddress'] as const) {
  let pageKey: string | undefined
  do {
    const page = await alchemy({ [side]: address, fromBlock: toHex(fromBlock), toBlock: 'latest', category: ['external', 'erc20'], excludeZeroValue: true, withMetadata: false, maxCount: '0x3e8', ...(pageKey ? { pageKey } : {}) })
    for (const t of page.transfers) seen.set(t.hash.toLowerCase(), [...(seen.get(t.hash.toLowerCase()) ?? []), t])
    pageKey = page.pageKey || undefined
  } while (pageKey)
}

const providerHashes = new Set(seen.keys())
const missing = [...truthHashes].filter((h) => !providerHashes.has(h))
const extra = [...providerHashes].filter((h) => !truthHashes.has(h))
const duplicated = [...seen.entries()].filter(([, v]) => new Set(v.map((t) => t.uniqueId)).size > 1)

console.log(`RPC ground truth: ${truthHashes.size} transactions${truth.complete ? '' : ' (bounded window)'}`)
console.log(`Provider:         ${providerHashes.size} transactions`)
console.log(`${missing.length === 0 ? 'PASS' : 'FAIL'}  provider is missing ${missing.length} transaction(s) the RPC shows`)
console.log(`INFO  provider has ${extra.length} transaction(s) the RPC scan did not list (for example failed or contract-only; inspect by hand)`)
console.log(`INFO  ${duplicated.length} transaction(s) have more than one record (native + token views of one transfer); the app would have to de-duplicate these`)
console.log('Failed (reverted) transactions are not testable here: neither source lists them from logs. Check the provider docs for that.')
process.exit(missing.length === 0 ? 0 : 1)
