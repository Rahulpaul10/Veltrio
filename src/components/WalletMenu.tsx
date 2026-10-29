import { useEffect, useRef, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useDisconnect, useSwitchChain } from 'wagmi'
import { ChevronDown, Copy, ExternalLink, LogOut, Network, Wallet } from 'lucide-react'
import { NETWORK_LABEL, ACTIVE_CHAIN_ID, addressUrl } from '@/veltrio/network'
import { shortAddr } from '@/veltrio/format'
import { useWallet } from '@/veltrio/wallet'
import { copyText } from './ui'
import { parseTxError } from '@/veltrio/errors'
import { toast } from 'sonner'

export function ConnectButton({ block = false, label = 'Connect Wallet' }: { block?: boolean; label?: string }) {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <button
          onClick={show}
          disabled={isConnecting}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 ${block ? 'w-full min-h-12' : ''}`}
          style={{ background: 'linear-gradient(135deg, #a5dcff 0%, #7fe3ee 100%)', color: '#06122a' }}
        >
          <Wallet className="size-4" aria-hidden />
          {isConnecting ? 'Connecting…' : label}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

export function WalletMenu() {
  const { address, isConnected, onActiveChain } = useWallet()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!isConnected || !address) return <ConnectButton />

  const itemCls = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-white/10'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="glass inline-flex min-h-11 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold hover:bg-white/10"
      >
        <span className="size-2 rounded-full" style={{ background: onActiveChain ? 'var(--success)' : 'var(--warn)' }} aria-hidden />
        <span className="mono tabular-nums">{shortAddr(address)}</span>
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-2xl p-2 shadow-2xl" style={{ background: '#0e1b36', border: '1px solid var(--border)' }}>
          <div className="px-3 pb-2 pt-2">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>Connected wallet</div>
            <div className="mono mt-1 break-all text-xs" style={{ color: 'var(--ink-2)' }}>{address}</div>
          </div>
          <button role="menuitem" className={itemCls} onClick={() => { void copyText(address, 'Address copied'); setOpen(false) }}>
            <Copy className="size-4" aria-hidden /> Copy address
          </button>
          <a role="menuitem" className={itemCls} href={addressUrl(address)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden /> View on Arc Explorer
          </a>
          {!onActiveChain && (
            <button
              role="menuitem"
              className={itemCls}
              disabled={isPending}
              onClick={() =>
                switchChain(
                  { chainId: ACTIVE_CHAIN_ID },
                  { onError: (e) => toast.error(parseTxError(e).kind === 'rejected' ? 'Network switch cancelled.' : `Could not switch to ${NETWORK_LABEL}.`) },
                )
              }
            >
              <Network className="size-4" aria-hidden /> Switch to {NETWORK_LABEL}
            </button>
          )}
          <button role="menuitem" className={itemCls} style={{ color: 'var(--danger)' }} onClick={() => { disconnect(); setOpen(false) }}>
            <LogOut className="size-4" aria-hidden /> Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
