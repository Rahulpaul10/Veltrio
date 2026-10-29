/**
 * Offline unit checks for Veltrio's money-critical logic. No network, no wallet.
 *   bun run test
 */
import assert from 'node:assert/strict'

// The app modules persist to localStorage on import; give them an in-memory stand-in.
const memory = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  addEventListener() {},
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) },
}

const { VERIFIED_NETWORKS, MIN_MAX_FEE_PER_GAS, NETWORK, SEND_ENABLED, IS_TESTNET } = await import('../src/veltrio/network')
const { requireChain } = await import('../src/onchain-facts')
const { Amount, parseAmount, usdcToGasToken, gasTokenToUsdc } = await import('../src/onchain-money')
const { validateAddress, addContact, renameContact, removeContact } = await import('../src/veltrio/contacts')
const { computeStats } = await import('../src/veltrio/history')
const { parseTxError } = await import('../src/veltrio/errors')
const { fmtAmount, fmtFee } = await import('../src/veltrio/format')
const { sendPreflight } = await import('../src/veltrio/sendPreflight')
const { loadReceipt } = await import('../src/veltrio/receiptData')
const { TransactionNotFoundError, TransactionReceiptNotFoundError } = await import('viem')
type HistoryItem = import('../src/veltrio/history').HistoryItem

let failed = 0
const pending: Promise<void>[] = []
const test = (name: string, fn: () => void | Promise<void>) => {
  const pass = () => console.log(`PASS  ${name}`)
  const fail = (error: unknown) => {
    failed += 1
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const result = fn()
    if (result instanceof Promise) pending.push(result.then(pass, fail))
    else pass()
  } catch (error) {
    fail(error)
  }
}

// ---- Network configuration ----
for (const [id, v] of Object.entries(VERIFIED_NETWORKS)) {
  test(`${id}: facts registry matches independently verified values`, () => {
    const c = requireChain(v.chainId)
    assert.equal(c.rpcUrls[0], v.rpcUrl)
    assert.equal(c.explorerBase, v.explorer)
    assert.equal(c.usdc?.address.toLowerCase(), v.usdc.toLowerCase())
    assert.equal(c.usdc?.decimals, 6)
    assert.equal(c.nativeCurrency.decimals, 18)
    assert.equal(c.nativeCurrency.isUsdc, true)
  })
}
test('mainnet is chain 5042 (0x13b2) and testnet is 5042002', () => {
  assert.equal(VERIFIED_NETWORKS.mainnet.chainId, 5042)
  assert.equal(VERIFIED_NETWORKS.mainnet.chainId.toString(16), '13b2')
  assert.equal(VERIFIED_NETWORKS.testnet.chainId, 5042002)
  assert.equal(VERIFIED_NETWORKS.mainnet.rpcUrl, 'https://rpc.mainnet.arc.io')
  assert.equal(VERIFIED_NETWORKS.mainnet.explorer, 'https://explorer.arc.io')
})
test('with no environment override the app is on testnet', () => {
  assert.equal(process.env.VITE_VELTRIO_NETWORK, undefined)
  assert.equal(NETWORK, 'testnet')
  assert.equal(IS_TESTNET, true)
  assert.equal(SEND_ENABLED, true)
})
test('fee floor is 20 gwei', () => assert.equal(MIN_MAX_FEE_PER_GAS, 20_000_000_000n))

// ---- Amount handling ----
test('USDC parses with 6 decimals and rejects a 7th', () => {
  assert.equal(parseAmount(5042, '1.234567').raw, 1_234_567n)
  assert.throws(() => parseAmount(5042, '1.2345678'))
  assert.throws(() => parseAmount(5042, 'abc'))
})
test('6-decimal and 18-decimal views convert exactly (10^12)', () => {
  const one = parseAmount(5042, '1')
  assert.equal(usdcToGasToken(5042, one).raw, 10n ** 18n)
  assert.equal(gasTokenToUsdc(5042, Amount.fromRaw(10n ** 18n, 18)).raw, 1_000_000n)
  assert.throws(() => one.add(Amount.fromRaw(1n, 18)))
})
test('display formatting', () => {
  assert.equal(fmtAmount(Amount.fromRaw(1_234_567_890n, 6)), '1,234.56789')
  assert.equal(fmtAmount(Amount.fromRaw(5_000_000n, 6)), '5.00')
  assert.equal(fmtFee(Amount.fromRaw(1_424_161_000_000_000n, 18)), '0.001424')
  assert.equal(fmtFee(Amount.fromRaw(1n, 18)), '< 0.000001')
})

// ---- Address validation and address book ----
test('address validation', () => {
  const lower = '0x8c00b323955f350fe50dbf768c1c18f46e3efafe'
  assert.equal(validateAddress(lower).ok, true)
  assert.equal(validateAddress(`  ${lower}  `).ok, true)
  assert.equal(validateAddress('0x123').ok, false)
  assert.equal(validateAddress('').ok, false)
  assert.equal(validateAddress('8c00b323955f350fe50dbf768c1c18f46e3efafe').ok, false)
  // Correct checksum passes; one flipped letter case must fail.
  const ok = validateAddress(lower)
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(validateAddress(ok.address).ok, true)
    const flipped = ok.address.replace(/[a-f]/, (c) => c.toUpperCase()).replace(/[A-F]/, (c) => c.toLowerCase())
    if (flipped !== ok.address) assert.equal(validateAddress(flipped).ok, false)
  }
})
test('address book: add, duplicate, rename, delete', () => {
  const a = addContact('Alex', '0x8c00b323955f350fe50dbf768c1c18f46e3efafe')
  assert.ok(a.ok)
  assert.equal(addContact('Again', '0x8c00b323955f350fe50dbf768c1c18f46e3efafe').ok, false)
  assert.equal(addContact('', '0x6100113e5ac1b42b8e44bfe588503fde7bde820ac').ok, false)
  assert.equal(addContact('Bad', '0xnothex').ok, false)
  if (a.ok) {
    assert.equal(renameContact(a.contact.id, 'Alex R'), null)
    assert.ok(renameContact(a.contact.id, '   '))
    removeContact(a.contact.id)
  }
  const stored = memory.get('veltrio:contacts:v1')
  assert.equal(stored, '[]')
})

// ---- Statistics ----
const base = { category: 'transfer' as const, from: '0xa', to: '0xb', timestamp: 1, fee: null, method: null, source: 'indexer' as const }
const item = (o: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'hash' | 'direction' | 'status'>): HistoryItem => ({ ...base, amount: Amount.fromRaw(1_000_000n, 6), ...o })
test('stats count each transaction once and exclude non-transfers, failed, pending and self-sends', () => {
  const stats = computeStats([
    item({ id: '1', hash: '0x1', direction: 'out', status: 'success' }),
    item({ id: '2', hash: '0x2', direction: 'in', status: 'success', amount: Amount.fromRaw(2_500_000n, 6) }),
    item({ id: '3a', hash: '0x3', direction: 'in', status: 'success' }),
    item({ id: '3b', hash: '0x3', direction: 'in', status: 'success' }), // same tx, two records
    item({ id: '4', hash: '0x4', direction: 'out', status: 'failed' }),
    item({ id: '5', hash: '0x5', direction: 'out', status: 'pending' }),
    item({ id: '6', hash: '0x6', direction: 'self', status: 'success' }),
    item({ id: '7', hash: '0x7', direction: 'out', status: 'success', category: 'contract' }),
  ])
  assert.equal(stats.totalTransactions, 7)
  assert.equal(stats.failed, 1)
  assert.equal(stats.successful, 5)
  assert.equal(stats.sent.raw, 1_000_000n)
  assert.equal(stats.received.raw, 4_500_000n)
})

// ---- Error mapping ----
test('error mapping never leaks raw errors and recognises rejection', () => {
  assert.equal(parseTxError({ code: 4001, message: 'x' }).kind, 'rejected')
  assert.equal(parseTxError(new Error('User rejected the request.')).kind, 'rejected')
  assert.equal(parseTxError(new Error('insufficient funds for gas')).kind, 'insufficient')
  assert.equal(parseTxError(new Error('execution reverted')).kind, 'reverted')
  assert.equal(parseTxError(new Error('HTTP request failed')).kind, 'network')
  assert.equal(parseTxError(new Error('something at 0xdeadbeef broke')).kind, 'other')
})


// ---- Send preflight (fee handling, balance, simulation) with a stub client ----
type PF = import('../src/veltrio/sendPreflight').PreflightClient
const stubClient = (o: { usdc: bigint; native: bigint; fee?: bigint; simulate?: 'ok' | 'revert' | 'rpc'; calls?: string[] }): PF =>
  ({
    readContract: () => Promise.resolve(o.usdc),
    getBalance: () => Promise.resolve(o.native),
    estimateFeesPerGas: () => Promise.resolve({ maxFeePerGas: o.fee ?? 24_000_000_000n, maxPriorityFeePerGas: 1n }),
    estimateContractGas: () => {
      o.calls?.push('simulate')
      return o.simulate === 'revert' ? Promise.reject(new Error('execution reverted')) : Promise.resolve(49_097n)
    },
  }) as unknown as PF
const one = (n: string) => parseAmount(5042002, n)
const me = '0x8c00b323955f350fE50dBf768C1c18F46E3eFaFE' as const
const you = '0x6100113E5Ac1b42B8E44bfe588503fE7BDE820Ac' as const

test('preflight passes with enough balance and returns a fee at or above the 20 gwei floor', async () => {
  const r = await sendPreflight(stubClient({ usdc: 5_000_000n, native: 5n * 10n ** 18n, fee: 5_000_000_000n }), { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 1_000_000_000n })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.maxFeePerGas, MIN_MAX_FEE_PER_GAS)
    assert.equal(r.maxFee.raw, 49_097n * MIN_MAX_FEE_PER_GAS)
  }
})
test('preflight uses the highest of fresh quote, shown quote and the floor', async () => {
  const r = await sendPreflight(stubClient({ usdc: 5_000_000n, native: 5n * 10n ** 18n, fee: 30_000_000_000n }), { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 25_000_000_000n })
  assert.ok(r.ok && r.maxFeePerGas === 30_000_000_000n)
})
test('preflight refuses when the amount exceeds the balance (no simulation, nothing sent)', async () => {
  const calls: string[] = []
  const r = await sendPreflight(stubClient({ usdc: 500_000n, native: 5n * 10n ** 17n, calls }), { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 24_000_000_000n })
  assert.deepEqual(r, { ok: false, reason: 'balance' })
  assert.equal(calls.length, 0)
})
test('preflight refuses when amount + fee exceeds balance even though the amount alone fits', async () => {
  const r = await sendPreflight(stubClient({ usdc: 1_000_000n, native: 10n ** 18n }), { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 24_000_000_000n })
  assert.deepEqual(r, { ok: false, reason: 'balance' })
})
test('preflight refuses when the simulated transfer reverts (restricted address)', async () => {
  const r = await sendPreflight(stubClient({ usdc: 5_000_000n, native: 5n * 10n ** 18n, simulate: 'revert' }), { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 24_000_000_000n })
  assert.deepEqual(r, { ok: false, reason: 'rejected' })
})
test('preflight surfaces RPC failures instead of guessing', async () => {
  const broken = { ...stubClient({ usdc: 1n, native: 1n }), getBalance: () => Promise.reject(new Error('HTTP request failed')) } as unknown as PF
  await assert.rejects(sendPreflight(broken, { from: me, to: you, amount: one('1'), gas: 49_097n, quotedMaxFeePerGas: 24_000_000_000n }), /HTTP request failed/)
})

// ---- Receipt loading: "not found" vs RPC failure ----
type RC = Parameters<typeof loadReceipt>[0]
const hash = ('0x' + 'ab'.repeat(32)) as `0x${string}`
test('receipt: unknown hash is "not found" (null)', async () => {
  const c = { getTransaction: () => Promise.reject(new TransactionNotFoundError({ hash })), getTransactionReceipt: () => Promise.resolve(null), getBlock: () => Promise.resolve(null) } as unknown as RC
  assert.equal(await loadReceipt(c, hash), null)
})
test('receipt: an RPC outage is an error, not "not found"', async () => {
  const c = { getTransaction: () => Promise.reject(new Error('HTTP request failed')), getTransactionReceipt: () => Promise.resolve(null), getBlock: () => Promise.resolve(null) } as unknown as RC
  await assert.rejects(loadReceipt(c, hash), /HTTP request failed/)
})
const baseTx = { from: me, to: '0x3600000000000000000000000000000000000000', input: '0xa9059cbb' + '000000000000000000000000' + you.slice(2).toLowerCase() + (1_500_000n).toString(16).padStart(64, '0'), value: 0n, gas: 60_000n, maxFeePerGas: 24_000_000_000n }
test('receipt: transaction without a receipt is pending with an ESTIMATED fee', async () => {
  const c = { getTransaction: () => Promise.resolve(baseTx), getTransactionReceipt: () => Promise.reject(new TransactionReceiptNotFoundError({ hash })), getBlock: () => Promise.resolve(null) } as unknown as RC
  const r = await loadReceipt(c, hash)
  assert.equal(r?.status, 'pending')
  assert.equal(r?.feeKind, 'estimated')
  assert.equal(r?.timestamp, null)
  assert.equal(r?.amount?.raw, 1_500_000n)
})
test('receipt: mined and reverted is FAILED with a CONFIRMED fee; mined and ok is success', async () => {
  const mk = (status: 'success' | 'reverted') => ({ getTransaction: () => Promise.resolve(baseTx), getTransactionReceipt: () => Promise.resolve({ status, gasUsed: 50_000n, effectiveGasPrice: 24_000_000_000n, blockNumber: 10n, logs: [] }), getBlock: () => Promise.resolve({ timestamp: 1_700_000_000n }) }) as unknown as RC
  const failed = await loadReceipt(mk('reverted'), hash)
  assert.equal(failed?.status, 'failed')
  assert.equal(failed?.feeKind, 'confirmed')
  assert.equal(failed?.fee?.raw, 50_000n * 24_000_000_000n)
  assert.equal((await loadReceipt(mk('success'), hash))?.status, 'success')
})

// ---- Network and send gating across build configurations (separate processes, real env) ----
import { spawnSync } from 'node:child_process'
const probe = (env: Record<string, string>) => {
  const code = `(globalThis).window={addEventListener(){},localStorage:{getItem:()=>null,setItem(){}}};const n=await import('./src/veltrio/network.ts');console.log(JSON.stringify({net:n.NETWORK,id:n.ACTIVE_CHAIN_ID,send:n.SEND_ENABLED,hist:n.HISTORY_MODE}))`
  const out = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, VITE_VELTRIO_NETWORK: '', VITE_ENABLE_MAINNET_SEND: '', VITE_HISTORY_API_URL: '', ...env }, cwd: process.cwd(), encoding: 'utf8' })
  return JSON.parse(out.stdout.trim().split('\n').pop() ?? '{}') as { net: string; id: number; send: boolean; hist: string }
}
test('mainnet build: chain 5042, read-only (Send OFF), RPC history', () => {
  const r = probe({ VITE_VELTRIO_NETWORK: 'mainnet' })
  assert.deepEqual(r, { net: 'mainnet', id: 5042, send: false, hist: 'rpc' })
})
test('mainnet build: no environment variable can turn Send on (flag and truthy values are ignored)', () => {
  for (const flag of ['true', '1', 'yes', 'TRUE', 'enabled']) {
    assert.equal(probe({ VITE_VELTRIO_NETWORK: 'mainnet', VITE_ENABLE_MAINNET_SEND: flag }).send, false, `flag ${flag}`)
  }
})
test('a mistyped network value falls back to testnet, never mainnet', () => {
  assert.equal(probe({ VITE_VELTRIO_NETWORK: 'Mainnet' }).net, 'testnet')
  assert.equal(probe({ VITE_VELTRIO_NETWORK: 'main' }).net, 'testnet')
  assert.equal(probe({}).id, 5042002)
})
test('testnet build: Send available, indexer history', () => {
  assert.deepEqual(probe({ VITE_VELTRIO_NETWORK: 'testnet' }), { net: 'testnet', id: 5042002, send: true, hist: 'indexer' })
})
test('a history provider URL in the environment is ignored (no provider or credential in this release)', () => {
  assert.equal(probe({ VITE_VELTRIO_NETWORK: 'mainnet', VITE_HISTORY_API_URL: 'https://example.com/v2/not-a-real-key' }).hist, 'rpc')
})

await Promise.all(pending)
console.log(failed === 0 ? '\nAll unit checks passed.' : `\n${failed} unit check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
