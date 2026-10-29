import { QRCodeSVG } from 'qrcode.react'
import { ExternalLink, ShieldAlert } from 'lucide-react'
import { ConnectGate } from '@/components/ConnectGate'
import { Card, CopyButton, Notice, PageHeader } from '@/components/ui'
import { useWallet } from '@/veltrio/wallet'
import { NETWORK_LABEL, FAUCET_URL, IS_TESTNET, addressUrl } from '@/veltrio/network'

function ReceiveContent() {
  const { address, wrongChain } = useWallet()
  if (!address) return null
  return (
    <Card className="mx-auto max-w-lg text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(143,211,255,0.1)', color: 'var(--accent)' }}>
        {NETWORK_LABEL} · USDC
      </div>

      <div className="mx-auto mt-5 w-fit rounded-3xl bg-white p-4">
        <QRCodeSVG value={address} size={208} level="M" bgColor="#ffffff" fgColor="#0b1730" title={`QR code for ${address}`} />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>The QR code contains only your wallet address.</p>

      <div className="mono mt-4 break-all rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
        {address}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CopyButton text={address} label="Copy address" message="Address copied to clipboard" className="!min-h-12 w-full" />
        <a href={addressUrl(address)} target="_blank" rel="noopener noreferrer" className="glass inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold hover:bg-white/10">
          View on Arc Explorer <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>

      {wrongChain && <Notice tone="warn" className="mt-4 text-left">Your wallet is on another network right now. Your address stays the same, but senders must use {NETWORK_LABEL}.</Notice>}

      <div className="mt-5 rounded-2xl p-4 text-left text-sm" style={{ background: 'rgba(245,199,107,0.08)', border: '1px solid rgba(245,199,107,0.28)' }}>
        <div className="mb-1.5 flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" style={{ color: 'var(--warn)' }} aria-hidden /> Tell the sender</div>
        <ul className="list-disc space-y-1 pl-5 text-pretty" style={{ color: 'var(--ink-2)' }}>
          <li>Send only USDC on <strong>{NETWORK_LABEL}</strong>. Other networks or tokens may not arrive and can be lost.</li>
          <li>Verify the full address, not just the first and last characters.</li>
          <li>This is your own wallet address. Veltrio never holds funds and has no deposit addresses.</li>
        </ul>
      </div>

      <ol className="mt-5 list-decimal space-y-1 pl-5 text-left text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        <li>Share your address or QR code with the sender.</li>
        <li>They send USDC on {NETWORK_LABEL} to this address.</li>
        <li>It appears in your balance and Transactions once the network confirms it.</li>
      </ol>

      {IS_TESTNET && (
        <p className="mt-4 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Need test funds? Request test USDC for this address from the{' '}
          <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Circle faucet</a>.
        </p>
      )}
    </Card>
  )
}

export function Receive() {
  return (
    <>
      <PageHeader title="Receive USDC" subtitle="Share your address to receive USDC into your own wallet." />
      <ConnectGate title="Connect to see your address">
        <ReceiveContent />
      </ConnectGate>
    </>
  )
}
