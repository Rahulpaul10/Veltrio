import { ExternalLink } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { Card, CopyButton, Row } from './ui'
import { ACTIVE_CHAIN, ACTIVE_CHAIN_ID, NETWORK_LABEL, USDC_ADDRESS, addressUrl } from '@/veltrio/network'

/** The one asset Veltrio supports, described from the verified network configuration (nothing hard-coded here). */
export function AssetInfo() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <TokenUSDC variant="branded" size={32} />
        <div>
          <h2 className="display text-lg font-semibold leading-tight">USDC</h2>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>The only asset Veltrio shows · {NETWORK_LABEL} (chain {ACTIVE_CHAIN_ID})</p>
        </div>
      </div>
      <div className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
        <Row label="ERC-20 interface">
          <span className="inline-flex flex-wrap items-center justify-end gap-2">
            <span className="mono text-xs break-all">{USDC_ADDRESS}</span>
            <CopyButton text={USDC_ADDRESS} label="Copy" message="USDC contract address copied" />
            <a href={addressUrl(USDC_ADDRESS)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Explorer <ExternalLink className="size-3" aria-hidden />
            </a>
          </span>
        </Row>
        <Row label="Decimals shown">6 (ERC-20 view)</Row>
        <Row label="Gas token">USDC, {ACTIVE_CHAIN.nativeCurrency.decimals} decimals in the native view</Row>
      </div>
      <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        The native and ERC-20 views are one balance, so Veltrio shows a single USDC amount. Amounts below 0.000001 USDC exist only in the native view and are not shown.
      </p>
    </Card>
  )
}
