import { useSyncExternalStore } from 'react'

/**
 * Tiny localStorage-backed store. Holds only public, non-secret data
 * (saved addresses, public transaction hashes). Never keys or seed phrases.
 */
export interface PersistedStore<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (cb: () => void) => () => void
}

export function createPersistedStore<T>(key: string, fallback: T, sanitize: (raw: unknown) => T): PersistedStore<T> {
  const listeners = new Set<() => void>()

  const read = (): T => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? sanitize(JSON.parse(raw)) : fallback
    } catch {
      return fallback
    }
  }

  let cache: T = read()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  window.addEventListener('storage', (event) => {
    if (event.key === key) {
      cache = read()
      emit()
    }
  })

  return {
    get: () => cache,
    set: (next) => {
      cache = next
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private mode / quota). State stays in memory for this session.
      }
      emit()
    },
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

export function usePersisted<T>(store: PersistedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
