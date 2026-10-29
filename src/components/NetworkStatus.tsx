import { useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { ACTIVE_CHAIN_ID, IS_MAINNET, NETWORK_LABEL } from '@/veltrio/network'
import { useLatestBlock, useWallet } from '@/veltrio/wallet'
import { parseTxError } from '@/veltrio/errors'

export function NetworkBadge({ className = '' }: { className?: string }) {
  const { isConnected, onActiveChain } = useWallet()
  const { block, isError } = useLatestBlock()
  const color = isError ? 'var(--danger)' : isConnected && !onActiveChain ? 'var(--warn)' : isConnected ? 'var(--success)' : 'var(--subtle)'
  const text = isError
    ? 'RPC unreachable'
    : isConnected && !onActiveChain
      ? 'Wrong network'
      : `${NETWORK_LABEL}${block !== undefined ? ` · #${block.toLocaleString()}` : ''}`
  return (
    <div className={`glass inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold ${className}`} title={`Live network status from the ${NETWORK_LABEL} RPC`}>
      <span className="relative flex size-2">
        {!isError && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-50" style={{ background: color }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      <span className="tabular-nums">{text}</span>
    </div>
  )
}

export function NetworkBanner() {
  const { isConnected, wrongChain, walletChainName, walletOnMainnet } = useWallet()
  const { switchChain, isPending } = useSwitchChain()
  if (!isConnected || !wrongChain) return null
  return (
    <div role="alert" className="no-print mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-4xl flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'rgba(245,199,107,0.12)', border: '1px solid rgba(245,199,107,0.35)' }}>
      <div className="flex gap-3 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--warn)' }} aria-hidden />
        <p className="text-pretty">
          <strong>Your wallet is on {walletChainName}.</strong>{' '}
          Veltrio only works on {NETWORK_LABEL} (chain {ACTIVE_CHAIN_ID}). Sending is blocked until you switch.
          {walletOnMainnet && !IS_MAINNET && ' Mainnet is never used by this build.'}
        </p>
      </div>
      <button
        disabled={isPending}
        onClick={() =>
          switchChain(
            { chainId: ACTIVE_CHAIN_ID },
            { onError: (e) => toast.error(parseTxError(e).kind === 'rejected' ? 'Network switch cancelled.' : `Could not switch to ${NETWORK_LABEL}. Add it in your wallet manually.`) },
          )
        }
        className="min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
        style={{ background: 'var(--warn)', color: '#2a1d00' }}
      >
        {isPending ? 'Check your wallet…' : `Switch to ${NETWORK_LABEL}`}
      </button>
    </div>
  )
}
