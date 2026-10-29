import { getAddress, isAddress } from 'viem'
import { createPersistedStore, usePersisted } from './store'

export interface Contact {
  id: string
  label: string
  address: `0x${string}`
  createdAt: number
}

const MAX_LABEL = 40

function sanitize(raw: unknown): Contact[] {
  if (!Array.isArray(raw)) return []
  const out: Contact[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, label, address, createdAt } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof label !== 'string' || typeof address !== 'string') continue
    if (!isAddress(address)) continue
    out.push({
      id,
      label: label.slice(0, MAX_LABEL),
      address: getAddress(address),
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
    })
  }
  return out
}

const store = createPersistedStore<Contact[]>('veltrio:contacts:v1', [], sanitize)

export const useContacts = () => usePersisted(store)

export type ContactResult = { ok: true; contact: Contact } | { ok: false; error: string }

export function validateAddress(input: string): { ok: true; address: `0x${string}` } | { ok: false; error: string } {
  const value = input.trim()
  if (!value) return { ok: false, error: 'Enter a wallet address.' }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, error: 'Addresses start with 0x and are 42 characters long.' }
  // Mixed-case input must carry a valid EIP-55 checksum; all-lowercase / all-uppercase is accepted.
  if (!isAddress(value, { strict: true })) return { ok: false, error: 'Checksum mismatch. Re-check the address for typos.' }
  return { ok: true, address: getAddress(value) }
}

function checkLabel(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed) return 'Add a label so you can recognise this address.'
  if (trimmed.length > MAX_LABEL) return `Labels can be up to ${MAX_LABEL} characters.`
  return null
}

export function addContact(label: string, addressInput: string): ContactResult {
  const labelError = checkLabel(label)
  if (labelError) return { ok: false, error: labelError }
  const parsed = validateAddress(addressInput)
  if (!parsed.ok) return parsed
  const list = store.get()
  const existing = list.find((c) => c.address === parsed.address)
  if (existing) return { ok: false, error: `Already saved as "${existing.label}".` }
  const contact: Contact = {
    id: crypto.randomUUID(),
    label: label.trim(),
    address: parsed.address,
    createdAt: Date.now(),
  }
  store.set([contact, ...list])
  return { ok: true, contact }
}

export function renameContact(id: string, label: string): string | null {
  const error = checkLabel(label)
  if (error) return error
  store.set(store.get().map((c) => (c.id === id ? { ...c, label: label.trim() } : c)))
  return null
}

export function removeContact(id: string) {
  store.set(store.get().filter((c) => c.id !== id))
}

export function findContact(list: Contact[], address: string | undefined): Contact | undefined {
  if (!address) return undefined
  const lower = address.toLowerCase()
  return list.find((c) => c.address.toLowerCase() === lower)
}
