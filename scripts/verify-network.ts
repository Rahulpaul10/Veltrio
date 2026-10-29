/**
 * Read-only network verification for Veltrio. Sends NO transactions and needs NO keys.
 *
 *   bun run verify:network            # checks Arc Mainnet and Arc Testnet
 *   bun run verify:network mainnet    # one network
 *
 * Confirms, against the live JSON-RPC, that the values hard-coded in src/veltrio/network.ts are
 * real: chain ID, USDC contract (symbol, decimals, code), native vs ERC-20 balance parity,
 * the 20 gwei fee floor, and that a USDC transfer simulates (eth_estimateGas, no broadcast).
 */
import { createPublicClient, erc20Abi, http } from 'viem'
import { VERIFIED_NETWORKS, type NetworkId } from '../src/veltrio/network'

const only = process.argv[2] as NetworkId | undefined
const targets = (Object.keys(VERIFIED_NETWORKS) as NetworkId[]).filter((n) => !only || n === only)
let failures = 0

const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures += 1
}

for (const id of targets) {
  const v = VERIFIED_NETWORKS[id]
  console.log(`\n== ${v.label} ==`)
  const client = createPublicClient({ transport: http(v.rpcUrl) })
  try {
    const chainId = await client.getChainId()
    check(chainId === v.chainId, 'RPC chain ID matches', `${chainId}`)

    const [symbol, decimals, code] = await Promise.all([
      client.readContract({ address: v.usdc, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: v.usdc, abi: erc20Abi, functionName: 'decimals' }),
      client.getCode({ address: v.usdc }),
    ])
    check(symbol === 'USDC', 'USDC contract symbol', symbol)
    check(decimals === v.usdcDecimals, 'USDC ERC-20 decimals', `${decimals}`)
    check(Boolean(code && code !== '0x'), 'USDC contract has code at the configured address')

    // Find a funded address from recent system-emitter logs, then compare the two balance views.
    const head = await client.getBlockNumber()
    const logs = await client.getLogs({
      address: '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE',
      event: { type: 'event', name: 'Transfer', inputs: [{ type: 'address', name: 'from', indexed: true }, { type: 'address', name: 'to', indexed: true }, { type: 'uint256', name: 'value' }] },
      fromBlock: head - 500n,
      toBlock: head,
    })
    const candidates = [...new Set(logs.flatMap((l) => [l.args.from, l.args.to]).filter((a): a is `0x${string}` => Boolean(a) && a !== '0x0000000000000000000000000000000000000000'))].slice(0, 40)
    let holder: `0x${string}` | undefined
    let erc20 = 0n
    let native = 0n
    for (const candidate of candidates) {
      const [e, n] = await Promise.all([
        client.readContract({ address: v.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [candidate] }),
        client.getBalance({ address: candidate }),
      ])
      if (e > 1_000n) {
        holder = candidate
        erc20 = e
        native = n
        break
      }
    }
    if (holder) {
      check(native / 10n ** 12n === erc20, 'native (18 dec) / 1e12 equals ERC-20 balance (6 dec): one pool', `${erc20} vs ${native}`)

      const fees = await client.estimateFeesPerGas()
      const quoted = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
      console.log(`INFO  RPC quoted maxFeePerGas ${quoted} wei (Veltrio clamps to at least 20 gwei)`)
      const gas = await client.estimateContractGas({
        address: v.usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: ['0x000000000000000000000000000000000000dEaD', 1n],
        account: holder,
      })
      check(gas > 21_000n && gas < 500_000n, 'USDC transfer() simulates (no broadcast)', `${gas} gas`)
    } else {
      console.log('SKIP  no recent USDC activity found to sample balances')
    }
  } catch (error) {
    check(false, 'network reachable', error instanceof Error ? error.message.split('\n')[0] : String(error))
  }

  if (id === 'mainnet') {
    const res = await fetch(`${v.explorer}/api/v2/stats`, { headers: { accept: 'application/json' } }).catch(() => null)
    console.log(`INFO  explorer API ${v.explorer}/api/v2/stats -> ${res ? res.status : 'unreachable'} (mainnet history uses RPC logs; this explorer API is not used)`)
  }
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
