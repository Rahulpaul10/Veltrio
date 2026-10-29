import { useMemo, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, History, Info, RefreshCw } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { ConnectGate } from '@/components/ConnectGate'
import { TxList } from '@/components/TxList'
import { AssetInfo } from '@/components/AssetInfo'
import { HistoryLimitNotice } from '@/components/HistoryLimitNotice'
import { Card, EmptyState, ErrorState, GhostButton, Notice, Skeleton } from '@/components/ui'
import { Link } from '@/veltrio/router'
import { useUsdcBalance, useWallet } from '@/veltrio/wallet'
import { computeStats, useHistory } from '@/veltrio/history'
import { fmtAmount } from '@/veltrio/format'
import { NETWORK_LABEL, FAUCET_URL, IS_TESTNET, SEND_ENABLED } from '@/veltrio/network'

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>{label}</div>
      <div className="display mt-1.5 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-pretty" style={{ color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}

function Content() {
  const { address, onActiveChain } = useWallet()
  const { balance, available, reserved, isLoading, isError, refetch } = useUsdcBalance(address)
  const history = useHistory(address)
  const stats = useMemo(() => computeStats(history.items), [history.items])
  const recent = history.items.slice(0, 5)
  const complete = history.complete
  const unavailable = <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>Unavailable</span>

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, #2dd4e6, transparent 70%)' }} aria-hidden />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
              <TokenUSDC variant="branded" size={20} /> USDC balance · {NETWORK_LABEL}
            </div>
            <button onClick={() => void refetch()} className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-white/10" aria-label="Refresh balance">
              <RefreshCw className="size-4" aria-hidden />
            </button>
          </div>
          {isError ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }}>Could not read your balance from the network. Retry in a moment.</p>
          ) : isLoading || !balance ? (
            <Skeleton className="mt-4 h-12 w-56" />
          ) : (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="display text-5xl font-bold tabular-nums sm:text-6xl">{fmtAmount(balance)}</span>
              <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
          )}
          <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
            One USDC balance. On Arc, USDC is also the gas token, so fees are paid from this same balance.
          </p>

          <div className={`mt-5 grid gap-3 sm:max-w-md ${SEND_ENABLED ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {SEND_ENABLED && (
              <Link to="/send" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all hover:brightness-110" style={{ background: 'linear-gradient(135deg, #a5dcff 0%, #7fe3ee 100%)', color: '#06122a' }}>
                <ArrowUpRight className="size-4" aria-hidden /> Send
              </Link>
            )}
            <Link to="/receive" className="glass inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold hover:bg-white/10">
              <ArrowDownLeft className="size-4" aria-hidden /> Receive
            </Link>
          </div>
        </div>
      </Card>

      {balance?.isZero() && IS_TESTNET && (
        <Notice tone="info">
          This wallet has no test USDC yet. Get some from the{' '}
          <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline" style={{ color: 'var(--accent)' }}>
            Circle faucet <ExternalLink className="size-3" aria-hidden />
          </a>{' '}
          (select {NETWORK_LABEL}) and send it to your address.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Available" value={available ? `${fmtAmount(available)}` : '…'} hint={reserved.isPositive() ? `${fmtAmount(reserved)} USDC reserved for pending transfers` : 'Nothing reserved for pending transfers'} />
        <Tile label="Network" value={<span className="text-base">{onActiveChain ? 'Connected' : 'Wrong network'}</span>} hint={NETWORK_LABEL} />
        <Tile label="Successful" value={history.hasData ? stats.successful : history.isLoading ? '…' : unavailable} hint={history.hasData ? (complete ? 'All transactions' : 'In recent history only') : undefined} />
        <Tile label="Failed" value={history.hasData && history.failedVisible ? stats.failed : history.isLoading ? '…' : unavailable} hint={history.hasData ? (history.failedVisible ? (complete ? 'All transactions' : 'In recent history only') : 'Reverted transactions are not visible from RPC data') : undefined} />
      </div>

      <AssetInfo />

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="display text-lg font-semibold">Wallet activity summary</h2>
          <Link to="/activity" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Details</Link>
        </div>
        {history.hasData ? (
          complete ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Tile label="Total sent" value={`${fmtAmount(stats.sent)} USDC`} hint={`${stats.sentCount} direct transfers`} />
              <Tile label="Total received" value={`${fmtAmount(stats.received)} USDC`} hint={`${stats.receivedCount} direct transfers`} />
            </div>
          ) : (
            <Notice tone="warn" className="mt-3">
              Only your most recent activity is loaded, so lifetime totals for sent and received are not shown. Open Activity to see totals for the loaded period.
            </Notice>
          )
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        )}
      </Card>

      <HistoryLimitNotice address={address} coverageFrom={history.coverageFrom} source={history.source} />

      <Card className="!p-3 sm:!p-4">
        <div className="flex items-center justify-between px-2 pb-1 pt-1 sm:px-3">
          <h2 className="display text-lg font-semibold">Recent transactions</h2>
          <Link to="/transactions" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>View all</Link>
        </div>
        {history.isLoading ? (
          <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : history.error && !history.hasData ? (
          <ErrorState title="History unavailable" body={history.error.message} onRetry={() => void history.refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState icon={<History className="size-5" aria-hidden />} title={history.source === 'rpc' ? 'No recent USDC transfers found' : 'No transactions yet'} body={history.source === 'rpc' ? 'Nothing was found in the recent window this release can read. This does not mean the wallet has no earlier history.' : `Once you send or receive USDC on ${NETWORK_LABEL}, it appears here.`} action={<Link to="/receive"><GhostButton>Show my address</GhostButton></Link>} />
        ) : (
          <TxList items={recent} />
        )}
      </Card>

      <p className="flex gap-2 px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Balances come from the {NETWORK_LABEL} RPC.{' '}
        {history.source === 'rpc'
          ? 'History is read from recent USDC transfer logs on the RPC, so it covers a limited recent window and cannot show failed transactions from other apps.'
          : 'History comes from the Arc Explorer indexer and may lag the chain by a few seconds.'}
      </p>
    </div>
  )
}

export function Dashboard() {
  return (
    <ConnectGate title="Your money, on Arc">
      <Content />
    </ConnectGate>
  )
}
