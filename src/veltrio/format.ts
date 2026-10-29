import { Amount } from '@/onchain-money'
import { ACTIVE_CHAIN_ID } from './network'
import { gasTokenToUsdc } from '@/onchain-money'

export function shortAddr(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

function group(whole: string): string {
  const negative = whole.startsWith('-')
  const digits = negative ? whole.slice(1) : whole
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

/** Human display of a USDC amount: thousands separators, at least 2 and at most 6 decimals. */
export function fmtAmount(amount: Amount, minFraction = 2): string {
  const [whole, fraction = ''] = amount.toString().split('.')
  return `${group(whole)}.${fraction.padEnd(minFraction, '0')}`
}

/** Fee given in the 18-decimal gas view. Shown with up to 6 decimals, never rounded down to a false zero. */
export function fmtFee(gasAmount: Amount): string {
  if (gasAmount.isZero()) return '0.000000'
  const shown = gasAmount.toFixed(6)
  if (Number(shown) === 0) return '< 0.000001'
  return shown
}

/** Gas-view amount to the 6-decimal USDC view (truncating sub-micro dust). */
export function gasToUsdc(gasAmount: Amount): Amount {
  return gasTokenToUsdc(ACTIVE_CHAIN_ID, gasAmount, 'trunc')
}

export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return fmtDay(ms)
}
