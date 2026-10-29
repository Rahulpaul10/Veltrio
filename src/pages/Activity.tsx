import { useMemo, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, Layers } from 'lucide-react'
import { ConnectGate } from '@/components/ConnectGate'
import { TxList } from '@/components/TxList'
import { HistoryLimitNotice } from '@/components/HistoryLimitNotice'
import { Card, EmptyState, ErrorState, GhostButton, Notice, PageHeader, Skeleton } from '@/components/ui'
import { useWallet } from '@/veltrio/wallet'
import { computeStats, useHistory } from '@/veltrio/history'
import { fmtAmount, fmtDay, timeAgo } from '@/veltrio/format'
import { NETWORK_LABEL } from '@/veltrio/network'
import { Link } from '@/veltrio/router'

function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>{icon}{label}</div>
      <div className="display mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-pretty" style={{ color: 'var(--muted)' }}>{hint}</div>
    </div>
  )
}

function Content() {
  const { address } = useWallet()
  const history = useHistory(address)
  const stats = useMemo(() => computeStats(history.items), [history.items])

  if (history.isLoading) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>
  if (history.error && !history.hasData) return <Card><ErrorState title="Could not load activity" body={history.error.message} onRetry={() => void history.refetch()} /></Card>

  const complete = history.complete
  const scope = complete ? 'All time' : `Since ${history.coverageFrom ? fmtDay(history.coverageFrom) : 'recent history'}`
  const oldest = history.items.length ? history.items[history.items.length - 1].timestamp : null

  return (
    <div className="space-y-5">
      <HistoryLimitNotice address={address} coverageFrom={history.coverageFrom} source={history.source} />
      {history.source !== 'rpc' && (
      <Notice tone={complete ? 'info' : 'warn'}>
        {complete ? (
          <>These statistics cover <strong>all indexed activity</strong> for this wallet on {NETWORK_LABEL}{oldest ? `, from ${fmtDay(oldest)} to now` : ''}.</>
        ) : (
          <><strong>Limited history.</strong> Only the most recent activity was loaded ({scope.toLowerCase()}). Every figure below covers that period only and is not a lifetime total.</>
        )}
      </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Transactions" value={stats.totalTransactions} hint={`${scope}. Each transaction counted once.`} icon={<Layers className="size-3.5" aria-hidden />} />
        <Stat label="Successful" value={stats.successful} hint="Confirmed onchain." />
        <Stat label="Failed" value={history.failedVisible ? stats.failed : 'Unavailable'} hint={history.failedVisible ? 'Reverted. Fee still charged.' : 'Reverted transactions emit no logs, so RPC history cannot list them. Failed sends made in Veltrio still appear in your list.'} />
        <Stat label="USDC sent" value={<>{fmtAmount(stats.sent)}</>} hint={`${scope}. ${stats.sentCount} direct transfers.`} icon={<ArrowUpRight className="size-3.5" aria-hidden />} />
        <Stat label="USDC received" value={<>{fmtAmount(stats.received)}</>} hint={`${scope}. ${stats.receivedCount} direct transfers.`} icon={<ArrowDownLeft className="size-3.5" aria-hidden />} />
        <Stat label="Other activity" value={stats.otherCount} hint="Contract calls and swaps. Not counted as sent or received." />
      </div>

      <Card className="!p-3 sm:!p-4">
        <div className="flex items-center justify-between px-2 pb-1 pt-1 sm:px-3">
          <h2 className="display text-lg font-semibold">Recent wallet activity</h2>
          <Link to="/transactions" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>All transactions</Link>
        </div>
        {history.items.length === 0 ? (
          <EmptyState icon={<Layers className="size-5" aria-hidden />} title="No activity yet" body="Statistics appear once this wallet has sent or received USDC." action={<Link to="/receive"><GhostButton>Show my address</GhostButton></Link>} />
        ) : (
          <TxList items={history.items.slice(0, 8)} />
        )}
      </Card>

      <Card>
        <h2 className="display text-base font-semibold">How these numbers are counted</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          <li>Source: {history.source === 'rpc' ? 'USDC Transfer logs read directly from the Arc RPC' : 'the Arc Explorer indexer'}, plus transfers you submitted from Veltrio in this browser. {history.fetchedAt ? `Last updated ${timeAgo(history.fetchedAt)}.` : ''}</li>
          <li>USDC sent and received include only successful, direct USDC transfers in the 6-decimal USDC view. Failed and pending transfers are excluded.</li>
          <li>Swaps, approvals and other contract calls are listed as other activity, even when USDC moves inside them.</li>
          <li>A transfer to your own address is not counted as sent or received. Network fees are not included in the sent total.</li>
          <li>No prices or USD conversions are used. Amounts are USDC units.</li>
        </ul>
      </Card>
    </div>
  )
}

export function Activity() {
  return (
    <>
      <PageHeader title="Wallet activity" subtitle={`A plain summary of what this wallet has done on ${NETWORK_LABEL}.`} />
      <ConnectGate title="Connect to see your activity">
        <Content />
      </ConnectGate>
    </>
  )
}
