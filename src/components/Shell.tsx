import type { ReactNode } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, BookUser, FlaskConical, LayoutDashboard, ListOrdered, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import { Link, useRoute, type Route } from '@/veltrio/router'
import { Logo } from './Logo'
import { WalletMenu } from './WalletMenu'
import { NetworkBadge, NetworkBanner } from './NetworkStatus'
import { NETWORK_LABEL, IS_TESTNET, SEND_ENABLED } from '@/veltrio/network'

const NAV: { to: string; label: string; short: string; match: Route['name'][]; icon: typeof Activity }[] = [
  { to: '/', label: 'Dashboard', short: 'Home', match: ['dashboard'], icon: LayoutDashboard },
  { to: '/send', label: 'Send', short: 'Send', match: ['send'], icon: ArrowUpRight },
  { to: '/receive', label: 'Receive', short: 'Receive', match: ['receive'], icon: ArrowDownLeft },
  { to: '/transactions', label: 'Transactions', short: 'History', match: ['transactions', 'tx'], icon: ListOrdered },
  { to: '/activity', label: 'Activity', short: 'Activity', match: ['activity'], icon: Activity },
  { to: '/saved', label: 'Saved Addresses', short: 'Saved', match: ['saved'], icon: BookUser },
]

// Read-only releases have no Send entry in the navigation (the /send route explains why).
const VISIBLE_NAV = NAV.filter((item) => SEND_ENABLED || item.to !== '/send')

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute()
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r p-5 lg:flex" style={{ borderColor: 'var(--border)' }}>
        <Link to="/" aria-label="Veltrio home" className="px-2 pt-1"><Logo /></Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {VISIBLE_NAV.map((item) => {
            const active = item.match.includes(route.name)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={clsx('flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-colors', active ? 'bg-white/10' : 'hover:bg-white/5')}
                style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}
              >
                <item.icon className="size-[18px]" style={{ color: active ? 'var(--accent)' : undefined }} aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-3">
          {IS_TESTNET ? (
            <div className="rounded-2xl p-3.5 text-xs" style={{ background: 'rgba(143,211,255,0.07)', border: '1px solid rgba(143,211,255,0.2)', color: 'var(--ink-2)' }}>
              <div className="mb-1 flex items-center gap-1.5 font-semibold"><FlaskConical className="size-3.5" style={{ color: 'var(--accent)' }} aria-hidden /> Testnet mode</div>
              Only {NETWORK_LABEL} test funds are used. Veltrio is non-custodial and never sees your keys.
            </div>
          ) : (
            <div className="rounded-2xl p-3.5 text-xs" style={{ background: 'rgba(245,199,107,0.08)', border: '1px solid rgba(245,199,107,0.3)', color: 'var(--ink-2)' }}>
              <div className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldAlert className="size-3.5" style={{ color: 'var(--warn)' }} aria-hidden /> {NETWORK_LABEL}</div>
              Read-only release. Real USDC balances and history, no sending. Veltrio is non-custodial and never sees your keys.
            </div>
          )}
          <p className="px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>Your Money. Your Wallet. Your Onchain World.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 backdrop-blur-xl sm:px-6" style={{ background: 'rgba(7,14,31,0.72)', borderBottom: '1px solid var(--border)' }}>
          <Link to="/" className="lg:hidden" aria-label="Veltrio home"><Logo size={28} /></Link>
          <NetworkBadge className="hidden lg:inline-flex" />
          <div className="flex items-center gap-2">
            <NetworkBadge className="hidden sm:inline-flex lg:hidden" />
            <WalletMenu />
          </div>
        </header>
        <NetworkBanner />
        <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">{children}</main>
      </div>

      <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" style={{ background: 'rgba(9,18,38,0.92)', borderTop: '1px solid var(--border)' }}>
        {VISIBLE_NAV.map((item) => {
          const active = item.match.includes(route.name)
          return (
            <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}>
              <item.icon className="size-5" aria-hidden />
              {item.short}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
