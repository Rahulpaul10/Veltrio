import type { Amount } from '@/onchain-money'
import { parseTxError, type ParsedTxError } from './errors'
import { sendPreflight, type PreflightClient } from './sendPreflight'

/**
 * The whole "press Send" decision in one testable function. It either asks the wallet to sign
 * exactly once, or explains why it did not. It never retries a signature request.
 *
 *   blocked  -> nothing was sent; a precondition failed (wrong chain, balance changed, network would reject)
 *   failed   -> nothing was sent; the wallet or RPC returned an error (user rejection, RPC failure, ...)
 *   submitted-> the wallet returned a transaction hash (NOT a confirmation: status is tracked separately)
 */
export interface SendDeps {
  client: PreflightClient
  activeChainId: number
  /** The chain the connected wallet is on right now. */
  getWalletChainId: () => Promise<number | undefined>
  /** Ask the wallet to sign and broadcast the USDC transfer. */
  writeTransfer: (args: { to: `0x${string}`; amount: Amount; maxFeePerGas: bigint }) => Promise<`0x${string}`>
}

export type SendOutcome =
  | { kind: 'submitted'; hash: `0x${string}` }
  | { kind: 'blocked'; reason: 'chain' | 'balance' | 'network-reject' }
  | { kind: 'failed'; error: ParsedTxError }

export async function runSend(
  deps: SendDeps,
  input: { from: `0x${string}`; to: `0x${string}`; amount: Amount; gas: bigint; quotedMaxFeePerGas: bigint },
): Promise<SendOutcome> {
  try {
    const walletChain = await deps.getWalletChainId()
    if (walletChain !== deps.activeChainId) return { kind: 'blocked', reason: 'chain' }

    const preflight = await sendPreflight(deps.client, input)
    if (!preflight.ok) return { kind: 'blocked', reason: preflight.reason === 'balance' ? 'balance' : 'network-reject' }

    const hash = await deps.writeTransfer({ to: input.to, amount: input.amount, maxFeePerGas: preflight.maxFeePerGas })
    return { kind: 'submitted', hash }
  } catch (error) {
    return { kind: 'failed', error: parseTxError(error) }
  }
}
