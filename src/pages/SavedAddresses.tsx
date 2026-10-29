import { useState, type FormEvent } from 'react'
import { BookUser, Check, ExternalLink, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, EmptyState, GhostButton, Notice, PageHeader, PrimaryButton, copyText } from '@/components/ui'
import { addContact, removeContact, renameContact, useContacts, validateAddress, type Contact } from '@/veltrio/contacts'
import { addressUrl, SEND_ENABLED } from '@/veltrio/network'
import { shortAddr } from '@/veltrio/format'
import { navigate } from '@/veltrio/router'

function AddForm() {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const check = address.trim() ? validateAddress(address) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = addContact(label, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setLabel('')
    setAddress('')
    toast.success(`Saved "${result.contact.label}"`)
  }

  return (
    <Card>
      <h2 className="display text-lg font-semibold">Add an address</h2>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <div>
          <label htmlFor="c-label" className="mb-1.5 block text-sm font-semibold">Label</label>
          <div className="field rounded-2xl px-4 py-3">
            <input id="c-label" value={label} maxLength={40} onChange={(e) => { setLabel(e.target.value); setError(null) }} placeholder="e.g. Alex, Rent, Treasury" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
          </div>
        </div>
        <div>
          <label htmlFor="c-address" className="mb-1.5 block text-sm font-semibold">Wallet address</label>
          <div className="field rounded-2xl px-4 py-3">
            <input id="c-address" value={address} onChange={(e) => { setAddress(e.target.value); setError(null) }} placeholder="0x…" autoComplete="off" autoCapitalize="off" spellCheck={false} className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
          </div>
          <div className="mt-1.5 min-h-5 text-xs">
            {check && !check.ok && <span style={{ color: 'var(--danger)' }}>{check.error}</span>}
            {check?.ok && <span style={{ color: 'var(--success)' }}>Valid address</span>}
          </div>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <PrimaryButton type="submit" disabled={!label.trim() || !check?.ok}><Plus className="size-4" aria-hidden /> Save address</PrimaryButton>
      </form>
    </Card>
  )
}

function ContactRow({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(contact.label)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const err = renameContact(contact.id, draft)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setEditing(false)
    toast.success('Label updated')
  }

  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }} aria-hidden>
          {contact.label.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div>
              <div className="field flex items-center gap-2 rounded-xl px-3 py-2">
                <input autoFocus value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} aria-label="Label" className="w-full bg-transparent text-sm outline-none" />
                <button onClick={save} aria-label="Save label" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-white/10"><Check className="size-4" style={{ color: 'var(--success)' }} aria-hidden /></button>
                <button onClick={() => { setEditing(false); setDraft(contact.label); setError(null) }} aria-label="Cancel" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" aria-hidden /></button>
              </div>
              {error && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
            </div>
          ) : (
            <div className="truncate text-sm font-semibold">{contact.label}</div>
          )}
          <div className="mono mt-0.5 break-all text-xs" style={{ color: 'var(--muted)' }}>
            <span className="sm:hidden">{shortAddr(contact.address, 10, 8)}</span>
            <span className="hidden sm:inline">{contact.address}</span>
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 pl-[52px]">
        {SEND_ENABLED && (
          <GhostButton className="!min-h-9 !px-3 text-xs" onClick={() => navigate('/send')} aria-label={`Open Send page (select ${contact.label} there)`}><Send className="size-3.5" aria-hidden /> Use in Send</GhostButton>
        )}
        <GhostButton className="!min-h-9 !px-3 text-xs" onClick={() => void copyText(contact.address, 'Address copied')}>Copy</GhostButton>
        <GhostButton className="!min-h-9 !px-3 text-xs" onClick={() => { setEditing(true); setDraft(contact.label) }}><Pencil className="size-3.5" aria-hidden /> Edit</GhostButton>
        <a href={addressUrl(contact.address)} target="_blank" rel="noopener noreferrer" aria-label={`View ${contact.label} on Arc Explorer`} className="inline-flex min-h-9 items-center rounded-2xl px-3 hover:bg-white/10" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><ExternalLink className="size-3.5" aria-hidden /></a>
        {confirmDelete ? (
          <>
            <button className="min-h-9 rounded-2xl px-3 text-xs font-semibold" style={{ background: 'var(--danger)', color: '#2a0009' }} onClick={() => { removeContact(contact.id); toast.success('Address removed') }}>Confirm delete</button>
            <GhostButton className="!min-h-9 !px-3 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</GhostButton>
          </>
        ) : (
          <GhostButton className="!min-h-9 !px-3 text-xs" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDelete(true)} aria-label={`Delete ${contact.label}`}><Trash2 className="size-3.5" aria-hidden /> Delete</GhostButton>
        )}
      </div>
    </li>
  )
}

export function SavedAddresses() {
  const contacts = useContacts()
  return (
    <>
      <PageHeader title="Saved addresses" subtitle={SEND_ENABLED ? 'Keep the addresses you use often. Choosing one only fills the Send form.' : 'Keep the addresses you use often, with your own labels. Stored only in this browser.'} />
      <div className="mx-auto max-w-2xl space-y-5">
        <Notice tone="info">
          Saved addresses are stored only in this browser on this device. They do not sync to other devices, and clearing your browser data removes them. No keys or seed phrases are ever stored.
        </Notice>
        <AddForm />
        <Card className="!pb-2">
          <h2 className="display text-lg font-semibold">Your addresses{contacts.length ? ` (${contacts.length})` : ''}</h2>
          {contacts.length === 0 ? (
            <EmptyState icon={<BookUser className="size-5" aria-hidden />} title="No saved addresses" body={SEND_ENABLED ? 'Add a label and a wallet address above. You can then pick it on the Send page.' : 'Add a label and a wallet address above to keep a labelled list.'} />
          ) : (
            <ul className="mt-1 divide-y" style={{ borderColor: 'var(--border)' }}>
              {contacts.map((c) => <ContactRow key={c.id} contact={c} />)}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
