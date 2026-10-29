/**
 * Offline flow tests for Veltrio's transaction path: fee estimation, the Send decision (simulation,
 * wrong chain, balance, user rejection, RPC errors), receipt waiting (pending, confirmed, failed),
 * and dropped-transaction tracking. Stub clients only: no network, no wallet, nothing is signed or sent.
 *   bun run test:flows
 */
import assert from 'node:assert/strict'

const memory = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  addEventListener() {},
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) },
}

const { MIN_MAX_FEE_PER_GAS, ACTIVE_CHAIN_ID, USDC_ADDRESS } = await import('../src/veltrio/network')
const { parseAmount } = await import('../src/onchain-money')
const { estimateTransfer } = await import('../src/veltrio/sendEstimate')
const { runSend } = await import('../src/veltrio/sendFlow')
const { waitForOutcome, WaitAborted, isStalePending, STALE_AFTER_MS } = await import('../src/veltrio/txTracking')
const { trackTx, updateTx, dismissTx, getPendingTxs } = await import('../src/veltrio/txStore')
type EstimateClient = import('../src/veltrio/sendEstimate').EstimateClient
type PreflightClient = import('../src/veltrio/sendPreflight').PreflightClient

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

const me = '0x8c00b323955f350fE50dBf768C1c18F46E3eFaFE' as const
const you = '0x6100113E5Ac1b42B8E44bfe588503fE7BDE820Ac' as const
const GWEI = 1_000_000_000n
const amt = (v: string) => parseAmount(ACTIVE_CHAIN_ID, v)

// ================= Fee estimation =================
const estClient = (o: { gas?: bigint; fees?: { maxFeePerGas?: bigint; gasPrice?: bigint }; gasError?: Error; seen?: unknown[] }): EstimateClient =>
  ({
    estimateContractGas: (args: unknown) => {
      o.seen?.push(args)
      return o.gasError ? Promise.reject(o.gasError) : Promise.resolve(o.gas ?? 49_097n)
    },
    estimateFeesPerGas: () => Promise.resolve(o.fees ?? { maxFeePerGas: 24n * GWEI }),
  }) as unknown as EstimateClient

test('fee estimate = gas x max fee per gas (18-decimal gas view)', async () => {
  const e = await estimateTransfer(estClient({ gas: 50_000n, fees: { maxFeePerGas: 30n * GWEI } }), me, you, amt('1'))
  assert.equal(e.gas, 50_000n)
  assert.equal(e.maxFeePerGas, 30n * GWEI)
  assert.equal(e.maxFee.raw, 50_000n * 30n * GWEI)
  assert.equal(e.maxFee.decimals, 18)
})
test('fee estimate never goes below the 20 gwei network floor', async () => {
  const e = await estimateTransfer(estClient({ fees: { maxFeePerGas: 2n * GWEI } }), me, you, amt('1'))
  assert.equal(e.maxFeePerGas, MIN_MAX_FEE_PER_GAS)
})
test('fee estimate falls back to gasPrice when the node gives no EIP-1559 quote', async () => {
  const e = await estimateTransfer(estClient({ fees: { gasPrice: 25n * GWEI } }), me, you, amt('1'))
  assert.equal(e.maxFeePerGas, 25n * GWEI)
})
test('fee estimate throws when the node gives no price at all (no invented fee)', async () => {
  await assert.rejects(estimateTransfer(estClient({ fees: {} }), me, you, amt('1')), /No gas price/)
})
test('fee estimate surfaces RPC failures', async () => {
  await assert.rejects(estimateTransfer(estClient({ gasError: new Error('HTTP request failed') }), me, you, amt('1')), /HTTP request failed/)
})
test('gas is estimated for the exact USDC transfer(to, amount) from the sender', async () => {
  const seen: unknown[] = []
  await estimateTransfer(estClient({ seen }), me, you, amt('2.5'))
  const call = seen[0] as { address: string; functionName: string; args: [string, bigint]; account: string }
  assert.equal(call.address, USDC_ADDRESS)
  assert.equal(call.functionName, 'transfer')
  assert.deepEqual(call.args, [you, 2_500_000n])
  assert.equal(call.account, me)
})

// ================= Send decision: simulation, chain, balance, rejection, RPC errors =================
interface Spies {
  writes: { to: string; raw: bigint; maxFeePerGas: bigint }[]
  reads: string[]
}
const preClient = (o: { usdc?: bigint; native?: bigint; fee?: bigint; simulateFails?: boolean; rpcDown?: boolean }, spies: Spies): PreflightClient =>
  ({
    readContract: () => {
      spies.reads.push('balanceOf')
      return o.rpcDown ? Promise.reject(new Error('HTTP request failed')) : Promise.resolve(o.usdc ?? 5_000_000n)
    },
    getBalance: () => Promise.resolve(o.native ?? 5n * 10n ** 18n),
    estimateFeesPerGas: () => Promise.resolve({ maxFeePerGas: o.fee ?? 24n * GWEI }),
    estimateContractGas: () => {
      spies.reads.push('simulate')
      return o.simulateFails ? Promise.reject(new Error('execution reverted')) : Promise.resolve(49_097n)
    },
  }) as unknown as PreflightClient

const sendCase = async (o: { client?: Parameters<typeof preClient>[0]; walletChain?: number | undefined; writeError?: Error }) => {
  const spies: Spies = { writes: [], reads: [] }
  const outcome = await runSend(
    {
      client: preClient(o.client ?? {}, spies),
      activeChainId: ACTIVE_CHAIN_ID,
      getWalletChainId: () => Promise.resolve('walletChain' in o ? o.walletChain : ACTIVE_CHAIN_ID),
      writeTransfer: ({ to, amount, maxFeePerGas }) => {
        spies.writes.push({ to, raw: amount.raw, maxFeePerGas })
        return o.writeError ? Promise.reject(o.writeError) : Promise.resolve(('0x' + 'cd'.repeat(32)) as `0x${string}`)
      },
    },
    { from: me, to: you, amount: amt('1'), gas: 49_097n, quotedMaxFeePerGas: 24n * GWEI },
  )
  return { outcome, spies }
}

test('send: happy path asks the wallet to sign exactly once, with the preflight fee', async () => {
  const { outcome, spies } = await sendCase({ client: { fee: 30n * GWEI } })
  assert.equal(outcome.kind, 'submitted')
  assert.equal(spies.writes.length, 1)
  assert.deepEqual(spies.writes[0], { to: you, raw: 1_000_000n, maxFeePerGas: 30n * GWEI })
  assert.ok(spies.reads.includes('simulate'), 'the transfer was simulated before signing')
})
test('send: a submitted hash is a submission, not a confirmation', async () => {
  const { outcome } = await sendCase({})
  assert.ok(outcome.kind === 'submitted' && !('status' in outcome))
})
test('send: wallet on the wrong chain is blocked before any read or signature', async () => {
  const { outcome, spies } = await sendCase({ walletChain: 11155111 })
  assert.deepEqual(outcome, { kind: 'blocked', reason: 'chain' })
  assert.equal(spies.writes.length, 0)
  assert.equal(spies.reads.length, 0)
})
test('send: a disconnected wallet (no chain) is blocked', async () => {
  const { outcome, spies } = await sendCase({ walletChain: undefined })
  assert.deepEqual(outcome, { kind: 'blocked', reason: 'chain' })
  assert.equal(spies.writes.length, 0)
})
test('send: balance dropped since review is blocked, never signed', async () => {
  const { outcome, spies } = await sendCase({ client: { usdc: 400_000n } })
  assert.deepEqual(outcome, { kind: 'blocked', reason: 'balance' })
  assert.equal(spies.writes.length, 0)
})
test('send: amount fits but amount + fee does not, so it is blocked', async () => {
  const { outcome, spies } = await sendCase({ client: { usdc: 1_000_000n, native: 10n ** 18n } })
  assert.deepEqual(outcome, { kind: 'blocked', reason: 'balance' })
  assert.equal(spies.writes.length, 0)
})
test('send: a simulated revert (for example restricted address) is blocked, never signed', async () => {
  const { outcome, spies } = await sendCase({ client: { simulateFails: true } })
  assert.deepEqual(outcome, { kind: 'blocked', reason: 'network-reject' })
  assert.equal(spies.writes.length, 0)
})
test('send: user rejection (code 4001) is reported as rejected, wallet asked once, no retry', async () => {
  const { outcome, spies } = await sendCase({ writeError: Object.assign(new Error('User rejected the request.'), { code: 4001 }) })
  assert.ok(outcome.kind === 'failed' && outcome.error.kind === 'rejected')
  assert.match(outcome.kind === 'failed' ? outcome.error.message : '', /Nothing was sent/)
  assert.equal(spies.writes.length, 1)
})
test('send: wallet-side insufficient funds is reported as insufficient', async () => {
  const { outcome } = await sendCase({ writeError: new Error('insufficient funds for gas * price + value') })
  assert.ok(outcome.kind === 'failed' && outcome.error.kind === 'insufficient')
})
test('send: RPC failure during preflight is a network error and nothing is signed', async () => {
  const { outcome, spies } = await sendCase({ client: { rpcDown: true } })
  assert.ok(outcome.kind === 'failed' && outcome.error.kind === 'network')
  assert.equal(spies.writes.length, 0)
})
test('send: raw errors never reach the UI message', async () => {
  const { outcome } = await sendCase({ writeError: new Error('boom at 0xdeadbeef /internal/path') })
  assert.ok(outcome.kind === 'failed')
  if (outcome.kind === 'failed') assert.doesNotMatch(outcome.error.message, /0xdeadbeef|internal/)
})

// ================= Waiting for receipts: pending, confirmed, failed, RPC trouble =================
const hash = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const receipt = (status: 'success' | 'reverted') => ({ status, gasUsed: 50_000n, effectiveGasPrice: 24n * GWEI, blockNumber: 77n, logs: [] })
const noSleep = () => Promise.resolve()

test('receipt wait: success receipt is confirmed, with the actual fee and block', async () => {
  const client = { waitForTransactionReceipt: () => Promise.resolve(receipt('success')) } as never
  assert.deepEqual(await waitForOutcome(client, hash, { sleep: noSleep }), { status: 'confirmed', feeRaw: (50_000n * 24n * GWEI).toString(), blockNumber: '77' })
})
test('receipt wait: reverted receipt is FAILED (and the fee is still reported)', async () => {
  const client = { waitForTransactionReceipt: () => Promise.resolve(receipt('reverted')) } as never
  const r = await waitForOutcome(client, hash, { sleep: noSleep })
  assert.equal(r.status, 'failed')
  assert.equal(r.feeRaw, (50_000n * 24n * GWEI).toString())
})
test('receipt wait: timeouts and RPC errors keep it pending, then it confirms (never marked failed)', async () => {
  let calls = 0
  let sleeps = 0
  const client = {
    waitForTransactionReceipt: () => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('Timed out while waiting for transaction'))
      if (calls === 2) return Promise.reject(new Error('HTTP request failed'))
      if (calls === 3) return Promise.reject(new Error('rate limit exceeded'))
      return Promise.resolve(receipt('success'))
    },
  } as never
  const r = await waitForOutcome(client, hash, { sleep: () => ((sleeps += 1), Promise.resolve()) })
  assert.equal(r.status, 'confirmed')
  assert.equal(calls, 4)
  assert.equal(sleeps, 3)
})
test('receipt wait: a transaction that never appears stays pending until stopped (no outcome invented)', async () => {
  const controller = new AbortController()
  let calls = 0
  const client = { waitForTransactionReceipt: () => ((calls += 1), Promise.reject(new Error('Timed out'))) } as never
  const sleep = () => {
    if (calls >= 5) controller.abort()
    return Promise.resolve()
  }
  await assert.rejects(waitForOutcome(client, hash, { signal: controller.signal, sleep }), (e: Error) => e instanceof WaitAborted)
  assert.equal(calls, 5)
})
test('receipt wait: already-aborted wait does not touch the network', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const client = { waitForTransactionReceipt: () => ((calls += 1), Promise.resolve(receipt('success'))) } as never
  await assert.rejects(waitForOutcome(client, hash, { signal: controller.signal }), (e: Error) => e instanceof WaitAborted)
  assert.equal(calls, 0)
})
test('receipt wait: abort while a request is in flight discards the result', async () => {
  const controller = new AbortController()
  const client = { waitForTransactionReceipt: () => ((controller.abort(), Promise.resolve(receipt('success')))) } as never
  await assert.rejects(waitForOutcome(client, hash, { signal: controller.signal }), (e: Error) => e instanceof WaitAborted)
})

// ================= Dropped / stuck transaction tracking =================
test('stale detection: pending for under 2 minutes is not stale, from 2 minutes it is', () => {
  const t = { status: 'pending' as const, submittedAt: 1_000_000 }
  assert.equal(isStalePending(t, 1_000_000 + STALE_AFTER_MS - 1), false)
  assert.equal(isStalePending(t, 1_000_000 + STALE_AFTER_MS), true)
})
test('stale detection never applies to confirmed or failed transactions', () => {
  assert.equal(isStalePending({ status: 'confirmed', submittedAt: 0 }, 10 * STALE_AFTER_MS), false)
  assert.equal(isStalePending({ status: 'failed', submittedAt: 0 }, 10 * STALE_AFTER_MS), false)
})
test('tracking lifecycle: pending -> stop tracking removes it without inventing an outcome', () => {
  const tx = { hash, chainId: ACTIVE_CHAIN_ID, from: me, to: you, amountRaw: '1000000', submittedAt: Date.now(), status: 'pending' as const }
  trackTx(tx)
  assert.equal(getPendingTxs().some((t) => t.hash === hash), true)
  dismissTx(hash)
  assert.equal(getPendingTxs().some((t) => t.hash === hash), false)
  assert.doesNotMatch(memory.get('veltrio:txs:v1') ?? '', /confirmed|failed/)
})
test('tracking lifecycle: only a receipt moves pending to confirmed / failed', () => {
  const other = ('0x' + 'ef'.repeat(32)) as `0x${string}`
  trackTx({ hash: other, chainId: ACTIVE_CHAIN_ID, from: me, to: you, amountRaw: '5', submittedAt: Date.now(), status: 'pending' })
  assert.equal(getPendingTxs().some((t) => t.hash === other), true)
  updateTx(other, { status: 'failed', feeRaw: '1' })
  assert.equal(getPendingTxs().some((t) => t.hash === other), false)
  assert.match(memory.get('veltrio:txs:v1') ?? '', /"status":"failed"/)
  dismissTx(other)
})
test('tracking ignores transactions recorded for another chain', () => {
  const other = ('0x' + '12'.repeat(32)) as `0x${string}`
  trackTx({ hash: other, chainId: 1, from: me, to: you, amountRaw: '5', submittedAt: Date.now(), status: 'pending' })
  assert.equal(getPendingTxs().some((t) => t.hash === other), false)
  dismissTx(other)
})

await Promise.all(pending)
console.log(failed === 0 ? '\nAll flow checks passed.' : `\n${failed} flow check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
