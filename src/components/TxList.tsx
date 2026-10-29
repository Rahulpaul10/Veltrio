import { ArrowDownLeft, ArrowUpRight, FileCode2, Repeat2 } from 'lucide-react'
import { Link } from '@/veltrio/router'
import type { HistoryItem } from '@/veltrio/history'
import { fmtAmount, shortAddr, timeAgo } from '@/veltrio/format'
import { findContact, useContacts, type Contact } from '@/veltrio/contacts'
import { StatusBadge } from './ui'

export function describe(item: HistoryItem): string {
  if (item.category === 'transfer') {
    if (item.direction === 'out') return 'Sent USDC'
    if (item.direction === 'in') return 'Received USDC'
    if (item.direction === 'self') return 'Sent to own address'
  }
  if (item.method === 'approve') return 'Token approval'
  if (item.method) return `Contract call: ${item.method}`
  return 'Contract interaction'
}

function counterparty(item: HistoryItem, contacts: Contact[]): string {
  const addr = item.direction === 'in' ? item.from : item.to
  if (!addr) return 'Contract creation'
  const label = findContact(contacts, addr)?.label
  const prefix = item.direction === 'in' ? 'From' : item.direction === 'out' || item.direction === 'self' ? 'To' : 'With'
  return `${prefix} ${label ? `${label} (${shortAddr(addr)})` : shortAddr(addr)}`
}

export function TxRow({ item }: { item: HistoryItem }) {
  const contacts = useContacts()
  const Icon = item.category === 'contract' ? (item.amount ? Repeat2 : FileCode2) : item.direction === 'in' ? ArrowDownLeft : ArrowUpRight
  const sign = item.category === 'transfer' ? (item.direction === 'in' ? '+' : item.direction === 'out' ? '−' : '') : ''
  const amountColor = item.status === 'failed' ? 'var(--subtle)' : item.status === 'pending' ? 'var(--warn)' : item.direction === 'in' && item.category === 'transfer' ? 'var(--success)' : 'var(--ink)'
  return (
    <li>
      <Link to={`/tx/${item.hash}`} className="flex min-h-[68px] items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/5 sm:px-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }}>
          <Icon className="size-[18px]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{describe(item)}</div>
          <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--muted)' }}>
            {counterparty(item, contacts)} · {timeAgo(item.timestamp)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.amount ? (
            <span className="text-sm font-semibold tabular-nums" style={{ color: amountColor, textDecoration: item.status === 'failed' ? 'line-through' : undefined }}>
              {sign}{fmtAmount(item.amount)} <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          ) : null}
          {(item.status !== 'success' || !item.amount) && <StatusBadge status={item.status} />}
        </div>
      </Link>
    </li>
  )
}

export function TxList({ items }: { items: HistoryItem[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {items.map((item) => (
        <TxRow key={item.id} item={item} />
      ))}
    </ul>
  )
}
