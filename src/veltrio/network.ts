/**
 * Single source of truth for the network Veltrio runs on.
 *
 * Chain facts come from `@/onchain-facts` and are cross-checked at load time against the
 * values below, which were verified against Arc's official documentation
 * (docs.arc.io: RPC endpoints, Contract addresses, Connect to Arc) and live JSON-RPC calls
 * on 2026-10-29. If the two ever disagree the app refuses to start, so a wrong chain ID,
 * RPC, explorer or USDC address can never silently reach a transaction.
 *
 * Network selection (build time, public value only):
 *   VITE_VELTRIO_NETWORK = "testnet" (default for dev) | "mainnet" (set for production builds by .env.production)
 *
 * Mainnet is READ-ONLY in this release: balance, history and receipts work, but signing and sending are
 * compiled out (`SEND_ENABLED` is false on mainnet and there is no environment flag that can change it).
 */

import { defineChain } from 'viem'
import { buildAddressExplorerUrl, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

export type NetworkId = 'mainnet' | 'testnet'

export const VERIFIED_NETWORKS = {
  mainnet: {
    label: 'Arc Mainnet',
    chainId: 5042,
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    usdcDecimals: 6,
    nativeDecimals: 18,
  },
  testnet: {
    label: 'Arc Testnet',
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorer: 'https://explorer.testnet.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    usdcDecimals: 6,
    nativeDecimals: 18,
  },
} as const

// Safe default: anything other than the exact string "mainnet" (including unset) means testnet.
export const NETWORK: NetworkId = import.meta.env.VITE_VELTRIO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
const expected = VERIFIED_NETWORKS[NETWORK]

export const ACTIVE_CHAIN_ID: number = expected.chainId
export const ACTIVE_CHAIN = requireChain(ACTIVE_CHAIN_ID)
export const NETWORK_LABEL: string = expected.label
export const IS_TESTNET = NETWORK === 'testnet'
export const IS_MAINNET = NETWORK === 'mainnet'
export const ACTIVE_RPC_URL = ACTIVE_CHAIN.rpcUrls[0]

// ---- Configuration self-check: facts registry vs. independently verified values ----
function assertConfig() {
  const problems: string[] = []
  if (ACTIVE_CHAIN.isTestnet !== IS_TESTNET) problems.push('testnet flag')
  if (ACTIVE_RPC_URL !== expected.rpcUrl) problems.push('RPC URL')
  if (ACTIVE_CHAIN.explorerBase !== expected.explorer) problems.push('explorer URL')
  if (ACTIVE_CHAIN.usdc?.address.toLowerCase() !== expected.usdc.toLowerCase()) problems.push('USDC address')
  if (ACTIVE_CHAIN.usdc?.decimals !== expected.usdcDecimals) problems.push('USDC decimals')
  if (ACTIVE_CHAIN.nativeCurrency.decimals !== expected.nativeDecimals || !ACTIVE_CHAIN.nativeCurrency.isUsdc) problems.push('native currency')
  if (problems.length) throw new Error(`Veltrio network configuration mismatch for ${NETWORK}: ${problems.join(', ')}. Refusing to start.`)
}
assertConfig()

export const USDC_ADDRESS = expected.usdc as `0x${string}`
/** Decimals of the ERC-20 USDC view (balances, transfers, display). */
export const USDC_DECIMALS_ACTIVE = usdcDecimalsFor(ACTIVE_CHAIN_ID)

/** The chain handed to wagmi, so "add network" in a wallet uses exactly the verified parameters. */
export const ACTIVE_VIEM_CHAIN = defineChain({
  id: ACTIVE_CHAIN_ID,
  name: ACTIVE_CHAIN.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: ACTIVE_CHAIN.nativeCurrency.decimals },
  rpcUrls: { default: { http: [ACTIVE_RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: ACTIVE_CHAIN.explorerBase } },
  testnet: IS_TESTNET,
})

// ---- History source ----
/**
 * Testnet: the Arc Testnet explorer's public Blockscout API (verified working from browsers).
 * Mainnet: the public explorer API sits behind a Cloudflare challenge (HTTP 403 for scripted
 * requests when checked 2026-10-29), so it is NOT used. Mainnet reads recent USDC Transfer logs
 * straight from the RPC, which is a bounded recent window (see docs/mainnet-read-only-release.md).
 * No third-party history provider and no provider credential is part of this release.
 */
export const INDEXER_API: string | null = IS_TESTNET ? `${ACTIVE_CHAIN.explorerBase}/api/v2` : null
export const HISTORY_MODE: 'indexer' | 'rpc' = INDEXER_API ? 'indexer' : 'rpc'

// ---- Sending ----
/** Sending exists only on testnet. Mainnet is permanently read-only in this release: there is no flag to enable it. */
export const SEND_ENABLED: boolean = IS_TESTNET
export const READ_ONLY = !SEND_ENABLED
export const SEND_DISABLED_REASON = `This is a read-only release of Veltrio on ${NETWORK_LABEL}. You can connect a wallet, see your real USDC balance, receive USDC and view history, but sending is not available.`

/** Arc silently drops transactions with maxFeePerGas below 20 gwei (docs.arc.io EVM differences). */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n

/** Public Circle faucet for end users, testnet only. */
export const FAUCET_URL = 'https://faucet.circle.com'

export const txUrl = (hash: string) => buildTxExplorerUrl(ACTIVE_CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(ACTIVE_CHAIN_ID, address)
