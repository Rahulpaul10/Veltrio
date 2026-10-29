import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Amount } from '@/onchain-money'
import { ACTIVE_CHAIN_ID, MIN_MAX_FEE_PER_GAS, USDC_ADDRESS } from './network'

export interface SendEstimate {
  gas: bigint
  /** maxFeePerGas to submit with, clamped to the network's 20 gwei floor. */
  maxFeePerGas: bigint
  /** Upper-bound fee (gas x max fee per gas) in the 18-decimal gas view. */
  maxFee: Amount
}

export type EstimateClient = Pick<PublicClient, 'estimateContractGas' | 'estimateFeesPerGas'>

/** Gas + fee quote for an ERC-20 USDC transfer. Throws on any RPC failure so callers never show a made-up fee. */
export async function estimateTransfer(client: EstimateClient, from: `0x${string}`, to: `0x${string}`, amount: Amount): Promise<SendEstimate> {
  const [gas, fees] = await Promise.all([
    client.estimateContractGas({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [to, amount.raw], account: from }),
    client.estimateFeesPerGas(),
  ])
  const quoted = fees.maxFeePerGas ?? fees.gasPrice
  if (!quoted) throw new Error('No gas price available')
  // Arc drops transactions priced below its 20 gwei floor without any error, so never go under it.
  const perGas = quoted > MIN_MAX_FEE_PER_GAS ? quoted : MIN_MAX_FEE_PER_GAS
  return { gas, maxFeePerGas: perGas, maxFee: Amount.fromRaw(gas * perGas, 18) }
}

/**
 * Gas estimate for an ERC-20 USDC transfer on Arc. USDC is the gas token, so the fee is
 * paid from the same balance that is being sent. The result is an upper bound: the fee
 * actually charged is gas used x the effective gas price, which is usually lower.
 */
export function useSendEstimate(from: `0x${string}` | undefined, to: `0x${string}` | undefined, amount: Amount | null, enabled: boolean) {
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID })
  const ready = Boolean(enabled && client && from && to && amount && amount.isPositive())
  const estimate = useQuery<SendEstimate>({
    queryKey: ['veltrio', 'estimate', from, to, amount?.raw.toString()],
    enabled: ready,
    staleTime: 10_000,
    retry: 1,
    queryFn: () => {
      if (!client || !from || !to || !amount) return Promise.reject(new Error('Estimate requested without inputs'))
      return estimateTransfer(client, from, to, amount)
    },
  })

  const code = useQuery({
    queryKey: ['veltrio', 'code', to],
    enabled: Boolean(client && to && enabled),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client || !to) return false
      const bytecode = await client.getCode({ address: to })
      return Boolean(bytecode && bytecode !== '0x')
    },
  })

  return {
    estimate: estimate.data,
    isEstimating: ready && estimate.isFetching && !estimate.data,
    estimateError: estimate.error,
    isContract: code.data === true,
    refetch: estimate.refetch,
  }
}
