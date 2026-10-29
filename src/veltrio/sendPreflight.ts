import { erc20Abi, type PublicClient } from 'viem'
import { Amount, usdcToGasToken } from '@/onchain-money'
import { ACTIVE_CHAIN_ID, MIN_MAX_FEE_PER_GAS, USDC_ADDRESS } from './network'

/**
 * Last checks before the wallet is asked to sign. Pure over a client, so it is unit-tested with a stub.
 * Everything here is a read or a simulation: it never signs or broadcasts.
 *
 * Fails with a reason ('balance' | 'rejected') when the transfer should not be attempted.
 * RPC failures throw, so the caller shows a network error instead of guessing.
 */
export type PreflightClient = Pick<PublicClient, 'readContract' | 'getBalance' | 'estimateFeesPerGas' | 'estimateContractGas'>

export type PreflightResult =
  | { ok: true; maxFeePerGas: bigint; maxFee: Amount }
  | { ok: false; reason: 'balance' | 'rejected' }

export async function sendPreflight(
  client: PreflightClient,
  input: { from: `0x${string}`; to: `0x${string}`; amount: Amount; gas: bigint; quotedMaxFeePerGas: bigint },
): Promise<PreflightResult> {
  const [usdcBalance, spendable, fees] = await Promise.all([
    client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [input.from] }),
    client.getBalance({ address: input.from }),
    client.estimateFeesPerGas(),
  ])

  // Use the highest of: fresh network quote, the quote shown to the user, and Arc's 20 gwei floor.
  const fresh = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
  let perGas = input.quotedMaxFeePerGas > fresh ? input.quotedMaxFeePerGas : fresh
  if (perGas < MIN_MAX_FEE_PER_GAS) perGas = MIN_MAX_FEE_PER_GAS
  const maxFee = Amount.fromRaw(input.gas * perGas, 18)

  const needed = usdcToGasToken(ACTIVE_CHAIN_ID, input.amount).add(maxFee)
  if (usdcBalance < input.amount.raw || Amount.fromRaw(spendable, 18).lt(needed)) return { ok: false, reason: 'balance' }

  try {
    await client.estimateContractGas({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [input.to, input.amount.raw], account: input.from })
  } catch {
    return { ok: false, reason: 'rejected' }
  }
  return { ok: true, maxFeePerGas: perGas, maxFee }
}
