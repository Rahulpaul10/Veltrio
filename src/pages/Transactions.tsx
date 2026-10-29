import { useState } from 'react'
import { History, Info, RefreshCw } from 'lucide-react'
import { ConnectGate } from '@/components/ConnectGate'
import { TxList } from '@/components/TxList'
import { HistoryLimitNotice } from '@/components/HistoryLimitNotice'
import { Card, EmptyState, ErrorState, GhostButton, Notice, PageHeader, Skeleton } from '@/components/ui'
import { useWallet } from '@/veltrio/wallet'
import { useHistory, type HistoryItem } from '@/veltrio/history'
import { fmtDay, timeAgo } from '@/veltrio/format'
import { Link } from '@/veltrio/router'
import { NETWORK_LABEL } from '@/veltrio/network'

type Filter = 'all' | 'sent' | 'received' | 'failed' | 'pending'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
]

function applyFilter(items: HistoryItem[], filter: Filter): HistoryItem[] {
  switch (filter) {
    case 'sent':
      return items.filter((i) => i.direction === 'out' && i.category === 'transfer')
    case 'received':
      return items.filter((i) => i.direction === 'in' && i.category === 'transfer')
    case 'failed':
      return items.filter((i) => i.status === 'failed')
    case 'pending':
      return items.filter((i) => i.status === 'pending')
    default:
      return items
  }
}

function Content() {
  const { address } = useWallet()
  const history = useHistory(address)
  const [filter, setFilter] = useState<Filter>('all')
  const shown = applyFilter(history.items, filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter transactions" className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors"
              style={{ background: filter === f.id ? 'var(--accent)' : 'var(--surface)', color: filter === f.id ? '#06122a' : 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <GhostButton onClick={() => void history.refetch()} loading={history.isFetching} aria-label="Refresh transactions">
          {!history.isFetching && <RefreshCw className="size-4" aria-hidden />} Refresh
        </GhostButton>
      </div>

      <HistoryLimitNotice address={address} coverageFrom={history.coverageFrom} source={history.source} />
      {history.hasData && !history.complete && history.source !== 'rpc' && (
        <Notice tone="warn">
          Showing your most recent activity{history.coverageFrom ? ` (since ${fmtDay(history.coverageFrom)})` : ''}. Older transactions may exist; the Arc Explorer shows full history.
        </Notice>
      )}
      {history.error && history.hasData && <Notice tone="danger">Could not refresh history: {history.error.message} Showing the last loaded data.</Notice>}

      <Card className="!p-2 sm:!p-3">
        {history.isLoading ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : history.error && !history.hasData ? (
          <ErrorState title="Could not load history" body={history.error.message} onRetry={() => void history.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" aria-hidden />}
            title={filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
            body={filter === 'all' ? (history.source === 'rpc' ? 'No USDC transfers were found in the recent window this release can read. This does not mean there is no earlier history.' : `USDC you send or receive on ${NETWORK_LABEL} will show up here.`) : 'Nothing matches this filter in the loaded history.'}
            action={filter === 'all' ? <Link to="/receive"><GhostButton>Show my address</GhostButton></Link> : undefined}
          />
        ) : (
          <TxList items={shown} />
        )}
      </Card>

      <p className="flex gap-2 px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {history.source === 'rpc' ? 'History is read from recent USDC transfer logs on the Arc RPC. Reverted transactions emit no logs, so failed transactions from other apps cannot be listed here.' : 'History comes from the Arc Explorer indexer, not the RPC node.'}{history.fetchedAt ? ` Updated ${timeAgo(history.fetchedAt)}.` : ''} Open a transaction for its receipt.
      </p>
    </div>
  )
}

export function Transactions() {
  return (
    <>
      <PageHeader title="Transactions" subtitle={`Real transfers and contract activity for your wallet on ${NETWORK_LABEL}.`} />
      <ConnectGate title="Connect to see your transactions">
        <Content />
      </ConnectGate>
    </>
  )
}
