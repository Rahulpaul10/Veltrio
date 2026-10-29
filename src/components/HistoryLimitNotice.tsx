import { ExternalLink } from 'lucide-react'
import { Notice } from './ui'
import { fmtDateTime } from '@/veltrio/format'
import { addressUrl, NETWORK_LABEL } from '@/veltrio/network'

/**
 * Always shown when history comes from the RPC rather than an indexer. It states exactly what the
 * list and the statistics cover, so an empty or short list is never mistaken for "no history".
 */
export function HistoryLimitNotice({ address, coverageFrom, source, className }: { address?: string; coverageFrom: number | null; source: 'indexer' | 'rpc'; className?: string }) {
  if (source !== 'rpc') return null
  return (
    <Notice tone="warn" className={className}>
      <strong>Limited history.</strong> This release reads your USDC transfers directly from the {NETWORK_LABEL} RPC, which covers only a recent window
      {coverageFrom ? ` (since ${fmtDateTime(coverageFrom)})` : ''}. Older transfers, and failed transactions made in other apps, are not listed, and no total here is a lifetime total.
      {address && (
        <>
          {' '}
          <a href={addressUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
            See full history on the Arc Explorer <ExternalLink className="size-3" aria-hidden />
          </a>
        </>
      )}
    </Notice>
  )
}
