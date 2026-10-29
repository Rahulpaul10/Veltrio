import { useEffect, useState } from 'react'
import { Notice, GhostButton } from './ui'
import { dismissTx, useAllTrackedTxs } from '@/veltrio/txStore'
import { txUrl } from '@/veltrio/network'
import { isStalePending } from '@/veltrio/txTracking'

/**
 * Arc finalizes in under a second, so a transaction still pending after two minutes was probably
 * dropped (for example priced under the network minimum fee). The app never calls it failed on a
 * guess: it explains, links the explorer, and lets the user stop tracking it.
 */
export function StalePending({ hash }: { hash: string }) {
  const all = useAllTrackedTxs()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const tx = all.find((t) => t.hash.toLowerCase() === hash.toLowerCase())
  if (!tx || !isStalePending(tx, now)) return null
  return (
    <Notice tone="warn" className="mt-4 text-left">
      <p>
        This transaction has been pending for over two minutes. Arc normally finalizes in under a second, so it may have been dropped by the network and may never confirm.
        Check the{' '}
        <a href={txUrl(tx.hash)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">explorer</a>{' '}
        and your wallet before retrying. Nothing is assumed to have succeeded or failed.
      </p>
      <GhostButton className="mt-3 !min-h-9 text-xs" onClick={() => dismissTx(tx.hash)}>Stop tracking this transaction</GhostButton>
    </Notice>
  )
}
