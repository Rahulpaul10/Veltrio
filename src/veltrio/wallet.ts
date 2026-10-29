import { useMemo } from 'react'
import { useAccount, useBlockNumber, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Amount } from '@/onchain-money'
import { getChain } from '@/onchain-facts'
import { ACTIVE_CHAIN, ACTIVE_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS_ACTIVE } from './network'
import { useTrackedTxs } from './txStore'

export function useWallet() {
  const { address, isConnected, isConnecting, isReconnecting, chainId, connector } = useAccount()
  const onActiveChain = isConnected && chainId === ACTIVE_CHAIN_ID
  const walletChain = chainId !== undefined ? getChain(chainId) : undefined
  return {
    address,
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    chainId,
    connector,
    onActiveChain,
    wrongChain: isConnected && !onActiveChain,
    walletChainName: walletChain?.name ?? (chainId !== undefined ? `chain ${chainId}` : 'an unknown network'),
    walletOnMainnet: Boolean(walletChain && !walletChain.isTestnet),
    activeChainName: ACTIVE_CHAIN.name,
  }
}

/** The single USDC balance, read from the 6-decimal ERC-20 view. Never summed with the native view. */
export function useUsdcBalance(address: `0x${string}` | undefined) {
  const query = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  })
  const balance = useMemo(
    () => (query.data !== undefined ? Amount.fromRaw(query.data, USDC_DECIMALS_ACTIVE) : undefined),
    [query.data],
  )
  const tracked = useTrackedTxs(address)
  // USDC committed to transfers that are submitted but not yet confirmed.
  const reserved = useMemo(
    () =>
      Amount.sum(
        tracked.filter((t) => t.status === 'pending').map((t) => Amount.fromRaw(BigInt(t.amountRaw), USDC_DECIMALS_ACTIVE)),
        USDC_DECIMALS_ACTIVE,
      ),
    [tracked],
  )
  const available = useMemo(() => {
    if (!balance) return undefined
    const diff = balance.sub(reserved)
    return diff.isNegative() ? Amount.zero(USDC_DECIMALS_ACTIVE) : diff
  }, [balance, reserved])

  return {
    balance,
    reserved,
    available,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

export function useLatestBlock() {
  const query = useBlockNumber({ chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 6_000 } })
  return { block: query.data, isError: query.isError, isLoading: query.isLoading }
}
