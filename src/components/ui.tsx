import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import clsx from 'clsx'
import type { ItemStatus } from '@/veltrio/history'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('glass rounded-3xl p-5 sm:p-6', className)}>{children}</section>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="display text-balance text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-prose text-pretty text-sm" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; block?: boolean }

export function PrimaryButton({ loading, block = true, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition-all',
        'hover:brightness-110 active:scale-[0.99] disabled:opacity-45 disabled:hover:brightness-100',
        block && 'w-full',
        className,
      )}
      style={{ background: 'linear-gradient(135deg, #a5dcff 0%, #7fe3ee 100%)', color: '#06122a' }}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function GhostButton({ className, children, loading, block, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors',
        'hover:bg-white/10 active:scale-[0.99] disabled:opacity-45',
        block && 'w-full',
        className,
      )}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
    return true
  } catch {
    toast.error('Copy is blocked by your browser. Select the text and copy it manually.')
    return false
  }
}

export function CopyButton({ text, label = 'Copy', message = 'Copied to clipboard', className }: { text: string; label?: string; message?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <GhostButton
      type="button"
      className={className}
      onClick={() => {
        void copyText(text, message).then((ok) => {
          if (!ok) return
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        })
      }}
    >
      {done ? <Check className="size-4" style={{ color: 'var(--success)' }} aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? 'Copied' : label}
    </GhostButton>
  )
}

const STATUS_STYLE: Record<ItemStatus, { label: string; color: string; bg: string; icon: ReactNode }> = {
  success: { label: 'Confirmed', color: 'var(--success)', bg: 'rgba(111,220,155,0.12)', icon: <CheckCircle2 className="size-3.5" aria-hidden /> },
  failed: { label: 'Failed', color: 'var(--danger)', bg: 'rgba(255,122,140,0.12)', icon: <XCircle className="size-3.5" aria-hidden /> },
  pending: { label: 'Pending', color: 'var(--warn)', bg: 'rgba(245,199,107,0.12)', icon: <Clock className="size-3.5" aria-hidden /> },
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.icon}
      {s.label}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-white/10', className)} aria-hidden />
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }}>
        {icon}
      </div>
      <h3 className="display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,122,140,0.12)', color: 'var(--danger)' }}>
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <h3 className="display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
      {onRetry && <GhostButton className="mt-4" onClick={onRetry}>Try again</GhostButton>}
    </div>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
  const bg = tone === 'danger' ? 'rgba(255,122,140,0.1)' : tone === 'warn' ? 'rgba(245,199,107,0.1)' : 'rgba(143,211,255,0.08)'
  return (
    <div className={clsx('flex gap-2.5 rounded-2xl p-3.5 text-sm', className)} style={{ background: bg, border: `1px solid ${color}33`, color: 'var(--ink-2)' }} role={tone === 'danger' ? 'alert' : undefined}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden />
      <div className="text-pretty">{children}</div>
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="min-w-0 break-all text-right font-medium tabular-nums">{children}</span>
    </div>
  )
}
