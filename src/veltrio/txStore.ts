import { useMemo } from 'react'
import { createPersistedStore, usePersisted } from './store'
import { ACTIVE_CHAIN_ID } from './network'

/**
 * Transactions submitted from this browser. They give instant "pending" feedback and keep
 * a receipt trail while the explorer indexer catches up. Status only ever moves to
 * confirmed / failed from a real onchain receipt.
 */
export interface TrackedTx {
  hash: `0x${string}`
  chainId: number
  from: string
  to: string
  /** ERC-20 USDC view (6 decimals), raw integer as a string. */
  amountRaw: string
  submittedAt: number
  status: 'pending' | 'confirmed' | 'failed'
  /** Confirmed fee in the 18-decimal gas view, raw integer as a string. Only set once a receipt exists. */
  feeRaw?: string
  blockNumber?: string
  resolvedAt?: number
}

const MAX_KEPT = 60

function isTx(item: unknown): item is TrackedTx {
  if (!item || typeof item !== 'object') return false
  const t = item as Record<string, unknown>
  return (
    typeof t.hash === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(t.hash) &&
    typeof t.chainId === 'number' &&
    typeof t.from === 'string' &&
    typeof t.to === 'string' &&
    typeof t.amountRaw === 'string' &&
    /^\d+$/.test(t.amountRaw) &&
    typeof t.submittedAt === 'number' &&
    (t.status === 'pending' || t.status === 'confirmed' || t.status === 'failed')
  )
}

const store = createPersistedStore<TrackedTx[]>('veltrio:txs:v1', [], (raw) => (Array.isArray(raw) ? raw.filter(isTx) : []))

export function trackTx(tx: TrackedTx) {
  const rest = store.get().filter((t) => t.hash.toLowerCase() !== tx.hash.toLowerCase())
  store.set([tx, ...rest].slice(0, MAX_KEPT))
}

export function updateTx(hash: string, patch: Partial<TrackedTx>) {
  store.set(store.get().map((t) => (t.hash.toLowerCase() === hash.toLowerCase() ? { ...t, ...patch } : t)))
}

export function dismissTx(hash: string) {
  store.set(store.get().filter((t) => t.hash.toLowerCase() !== hash.toLowerCase()))
}

export function getPendingTxs(): TrackedTx[] {
  return store.get().filter((t) => t.status === 'pending' && t.chainId === ACTIVE_CHAIN_ID)
}

/** Tracked transactions sent from `address` on the active chain. */
export function useTrackedTxs(address: string | undefined): TrackedTx[] {
  const all = usePersisted(store)
  return useMemo(() => {
    if (!address) return []
    const lower = address.toLowerCase()
    return all.filter((t) => t.chainId === ACTIVE_CHAIN_ID && t.from.toLowerCase() === lower)
  }, [all, address])
}

export function useAllTrackedTxs(): TrackedTx[] {
  return usePersisted(store)
}
