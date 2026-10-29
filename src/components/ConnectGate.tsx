import type { ReactNode } from 'react'
import { ShieldCheck, Wallet } from 'lucide-react'
import { useWallet } from '@/veltrio/wallet'
import { NETWORK_LABEL, READ_ONLY } from '@/veltrio/network'
import { Card, Skeleton } from './ui'
import { ConnectButton } from './WalletMenu'
import { LogoMark } from './Logo'

/** Renders children only for a connected wallet; otherwise a real connect prompt. */
export function ConnectGate({ children, title = 'Connect your wallet' }: { children: ReactNode; title?: string }) {
  const { isConnected, isConnecting } = useWallet()
  if (isConnected) return <>{children}</>
  if (isConnecting) return <Skeleton className="h-64 w-full rounded-3xl" />
  return (
    <Card className="mx-auto mt-6 max-w-lg text-center">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl" style={{ background: 'var(--surface-strong)' }}>
        <LogoMark size={36} />
      </div>
      <h1 className="display text-balance text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>
        {READ_ONLY ? <>Veltrio reads your real USDC balance and history on {NETWORK_LABEL}. This release is read-only: it never asks your wallet to sign or send anything.</> : <>Veltrio reads your real USDC balance and history on {NETWORK_LABEL}. Every transaction needs your explicit approval in your own wallet.</>}
      </p>
      <div className="mx-auto mt-5 max-w-xs"><ConnectButton block label="Connect Wallet" /></div>
      <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm" style={{ color: 'var(--ink-2)' }}>
        <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden /> Non-custodial. Veltrio never asks for or stores private keys or seed phrases.</li>
        <li className="flex gap-2.5"><Wallet className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden /> Works with MetaMask, Rabby and other browser wallets.</li>
      </ul>
    </Card>
  )
}
