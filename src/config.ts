/**
 * wagmi configuration for Veltrio.
 * Built with Arc Studio — https://studio.arc.io
 *
 * Only the active network (see src/veltrio/network.ts) is configured, so the wallet is only
 * ever asked to use that one chain, with the verified RPC and explorer.
 */

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { ACTIVE_CHAIN_ID, ACTIVE_RPC_URL, ACTIVE_VIEM_CHAIN } from '@/veltrio/network'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(ACTIVE_CHAIN_ID, ACTIVE_RPC_URL)

export const config = createConfig({
  chains: [ACTIVE_VIEM_CHAIN],
  // `injected()` discovers MetaMask, Rabby and other browser wallets (EIP-6963).
  connectors: [injected()],
  transports: {
    [ACTIVE_CHAIN_ID]: http(ACTIVE_RPC_URL),
  },
})
