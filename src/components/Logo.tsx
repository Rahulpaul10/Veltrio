import { useId } from 'react'

/** Original Veltrio mark: a faceted "V" with a small diamond above the notch. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" role="img" aria-label="Veltrio logo">
      <defs>
        <linearGradient id={`${id}-l`} x1="4" y1="8" x2="20" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f8cff" />
          <stop offset="1" stopColor="#2b5fd6" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="36" y1="8" x2="20" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" />
          <stop offset="1" stopColor="#22b8d9" />
        </linearGradient>
      </defs>
      <path d="M4 8h9l7 16v12L4 8Z" fill={`url(#${id}-l)`} />
      <path d="M36 8h-9l-7 16v12L36 8Z" fill={`url(#${id}-r)`} />
      <path d="M20 2.5 23.5 6 20 9.5 16.5 6 20 2.5Z" fill="#f4f7fd" />
    </svg>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="display text-xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
        Veltrio
      </span>
    </div>
  )
}
