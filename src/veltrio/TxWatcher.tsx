import { useEffect, useRef } from 'react'
import { usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { ACTIVE_CHAIN_ID } from './network'
import { updateTx, useAllTrackedTxs } from './txStore'
import { fmtAmount } from './format'
import { navigate } from './router'
import { waitForOutcome } from './txTracking'

/**
 * Watches every pending transaction for a real receipt and raises in-app notifications.
 * Mounted once at the app root so confirmation is tracked even after leaving the Send page.
 */
export function notifySubmitted(hash: string, amount: Amount) {
  toast.info('Transaction submitted', {
    id: `submitted-${hash}`,
    description: `Sending ${fmtAmount(amount)} USDC. Waiting for network confirmation.`,
    action: { label: 'View', onClick: () => navigate(`/tx/${hash}`) },
  })
}

export function TxWatcher() {
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID })
  const queryClient = useQueryClient()
  const all = useAllTrackedTxs()
  const watching = useRef(new Set<string>())

  const pendingKey = all
    .filter((t) => t.status === 'pending' && t.chainId === ACTIVE_CHAIN_ID)
    .map((t) => t.hash)
    .join(',')

  useEffect(() => {
    if (!client || !pendingKey) return
    const controller = new AbortController()
    const inFlight = watching.current
    const hashes = pendingKey.split(',') as `0x${string}`[]

    const watch = async (hash: `0x${string}`) => {
      let outcome
      try {
        outcome = await waitForOutcome(client, hash, { signal: controller.signal })
      } catch {
        return // aborted (unmounted or tracking stopped): the transaction stays pending
      }
      const tracked = all.find((t) => t.hash === hash)
      const amount = tracked ? Amount.fromRaw(BigInt(tracked.amountRaw), 6) : null
      const ok = outcome.status === 'confirmed'
      updateTx(hash, { status: outcome.status, feeRaw: outcome.feeRaw, blockNumber: outcome.blockNumber, resolvedAt: Date.now() })
      toast.dismiss(`submitted-${hash}`)
      const action = { label: 'View receipt', onClick: () => navigate(`/tx/${hash}`) }
      if (ok) {
        toast.success('Transaction confirmed', {
          description: amount ? `${fmtAmount(amount)} USDC sent and confirmed onchain.` : 'Confirmed onchain.',
          action,
        })
      } else {
        toast.error('Transaction failed', {
          description: 'The transaction was included but reverted. No USDC was moved; the network fee was still charged.',
          action,
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['veltrio'] })
      void queryClient.invalidateQueries({ queryKey: ['readContract'] })
    }

    for (const hash of hashes) {
      if (inFlight.has(hash)) continue
      inFlight.add(hash)
      void watch(hash).finally(() => inFlight.delete(hash))
    }

    return () => {
      controller.abort()
      inFlight.clear()
    }
    // `all` is read for the amount only; the watch set is keyed by pendingKey.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [client, pendingKey, queryClient])

  return null
}
