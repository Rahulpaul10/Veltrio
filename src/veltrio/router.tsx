import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

/** Minimal path router (History API). Keeps the bundle small and needs no extra dependency. */

export type Route =
  | { name: 'dashboard' }
  | { name: 'send' }
  | { name: 'receive' }
  | { name: 'transactions' }
  | { name: 'activity' }
  | { name: 'saved' }
  | { name: 'tx'; hash: string }

const NAV_EVENT = 'veltrio:navigate'

export function parsePath(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  switch (parts[0]) {
    case 'send':
      return { name: 'send' }
    case 'receive':
      return { name: 'receive' }
    case 'transactions':
      return { name: 'transactions' }
    case 'activity':
      return { name: 'activity' }
    case 'saved':
      return { name: 'saved' }
    case 'tx':
      return parts[1] ? { name: 'tx', hash: parts[1] } : { name: 'transactions' }
    default:
      return { name: 'dashboard' }
  }
}

export function navigate(path: string, options?: { replace?: boolean }) {
  if (path === window.location.pathname + window.location.search) return
  if (options?.replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(NAV_EVENT))
  window.scrollTo({ top: 0 })
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener(NAV_EVENT, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(NAV_EVENT, callback)
  }
}

const getPathname = () => window.location.pathname

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname, () => '/')
}

export function useRoute(): Route {
  return parsePath(usePathname())
}

export function Link({ to, onClick, children, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  )
}
