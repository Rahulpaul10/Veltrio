/**
 * Wallet-integration checks using wagmi's mock connector (no real wallet, no funds, no broadcasts).
 *   bun run test:wallet
 *
 * Exercises the same wagmi actions the app uses: connect, account/chain state, switching,
 * reading the USDC balance for the connected account, refusing to write on the wrong chain,
 * and mapping a user rejection. It does NOT sign or send any transaction.
 */
import assert from 'node:assert/strict'
import { createConfig, http } from 'wagmi'
import { connect, disconnect, getAccount, readContract, switchChain, writeContract } from 'wagmi/actions'
import { mock } from 'wagmi/connectors'
import { erc20Abi } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

;(globalThis as unknown as { window: unknown }).window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  localStorage: { getItem: () => null, setItem() {} },
}
const { ACTIVE_VIEM_CHAIN, ACTIVE_CHAIN_ID, USDC_ADDRESS, ACTIVE_RPC_URL, IS_MAINNET } = await import('../src/veltrio/network')
console.log(`Network under test: chain ${ACTIVE_CHAIN_ID}${IS_MAINNET ? ' (mainnet, read-only checks; no write is ever attempted)' : ' (testnet)'}`)
const { parseTxError } = await import('../src/veltrio/errors')

let failed = 0
const test = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
}

// A throwaway in-memory identity. Never funded, never stored, never used to sign here.
const account = privateKeyToAccount(generatePrivateKey())

const build = (features: Record<string, boolean> = {}) =>
  createConfig({
    chains: [ACTIVE_VIEM_CHAIN, sepolia],
    connectors: [mock({ accounts: [account.address], features })],
    transports: { [ACTIVE_CHAIN_ID]: http(ACTIVE_RPC_URL), [sepolia.id]: http() },
  })

await test('connect exposes the account address and active chain', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID })
  const a = getAccount(config)
  assert.equal(a.status, 'connected')
  assert.equal(a.address, account.address)
  assert.equal(a.chainId, ACTIVE_CHAIN_ID)
  await disconnect(config)
  assert.equal(getAccount(config).status, 'disconnected')
})

await test('USDC balance read for the connected account uses the verified contract (6 decimals)', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID })
  const raw = await readContract(config, { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [account.address], chainId: ACTIVE_CHAIN_ID })
  const decimals = await readContract(config, { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals', chainId: ACTIVE_CHAIN_ID })
  assert.equal(raw, 0n) // the throwaway account is unfunded, so a real read returns exactly zero
  assert.equal(decimals, 6)
})

await test('wallet on another network is detected and can be switched to the active chain', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: sepolia.id })
  assert.equal(getAccount(config).chainId, sepolia.id)
  await switchChain(config, { chainId: ACTIVE_CHAIN_ID })
  assert.equal(getAccount(config).chainId, ACTIVE_CHAIN_ID)
})

if (IS_MAINNET) {
  console.log('SKIP  write-refusal check: never calls writeContract against mainnet')
} else {
  await test('a write targeting the active chain is refused while the wallet is on another chain (nothing sent)', async () => {
    const config = build()
    await connect(config, { connector: config.connectors[0], chainId: sepolia.id })
    await assert.rejects(
      writeContract(config, { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: ['0x000000000000000000000000000000000000dEaD', 1n], chainId: ACTIVE_CHAIN_ID }),
      (error: Error) => {
        assert.match(`${error.name} ${error.message}`, /chain/i)
        return true
      },
    )
    assert.equal(parseTxError(new Error('The current chain of the wallet (id: 11155111) does not match the target chain')).kind, 'chain')
  })
}

await test('a rejected wallet request maps to a calm "rejected" message', async () => {
  const config = build({ switchChainError: true })
  await connect(config, { connector: config.connectors[0] })
  let caught: unknown
  try {
    await switchChain(config, { chainId: sepolia.id })
  } catch (error) {
    caught = error
  }
  assert.ok(caught, 'expected the switch to be rejected')
  assert.equal(parseTxError(caught).kind, 'rejected')
})

await test('a rejected connection leaves the app disconnected', async () => {
  const config = build({ connectError: true })
  await assert.rejects(connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID }))
  assert.equal(getAccount(config).status, 'disconnected')
  assert.equal(parseTxError({ code: 4001, message: 'User rejected the request.' }).kind, 'rejected')
})

await test('account change in the wallet is picked up', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID })
  const other = privateKeyToAccount(generatePrivateKey()).address
  const connector = config.connectors[0] as unknown as { onAccountsChanged: (accounts: string[]) => void }
  connector.onAccountsChanged([other])
  assert.equal(getAccount(config).address, other)
  assert.notEqual(getAccount(config).address, account.address)
})

await test('network change made inside the wallet is picked up (and flagged as the wrong chain)', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID })
  assert.equal(getAccount(config).chainId, ACTIVE_CHAIN_ID)
  const connector = config.connectors[0] as unknown as { onChainChanged: (chainId: string) => void }
  connector.onChainChanged(`0x${sepolia.id.toString(16)}`)
  assert.equal(getAccount(config).chainId, sepolia.id)
  assert.notEqual(getAccount(config).chainId, ACTIVE_CHAIN_ID)
})

await test('wallet-side disconnect returns the app to the disconnected state', async () => {
  const config = build()
  await connect(config, { connector: config.connectors[0], chainId: ACTIVE_CHAIN_ID })
  const connector = config.connectors[0] as unknown as { onDisconnect: () => void }
  connector.onDisconnect()
  assert.equal(getAccount(config).status, 'disconnected')
})


console.log(failed === 0 ? '\nAll wallet-integration checks passed.' : `\n${failed} wallet-integration check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
