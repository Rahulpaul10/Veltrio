import { useMemo, useRef, useState } from 'react'
import { usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { BookUser, CheckCircle2, ClipboardPaste, ExternalLink, Loader2, Pencil, XCircle } from 'lucide-react'
import { AmountError, Amount, parseAmount, usdcToGasToken } from '@/onchain-money'
import { ConnectGate } from '@/components/ConnectGate'
import { Card, GhostButton, Notice, PageHeader, PrimaryButton, Row } from '@/components/ui'
import { StalePending } from '@/components/StalePending'
import { ACTIVE_CHAIN_ID, IS_MAINNET, NETWORK_LABEL, SEND_DISABLED_REASON, SEND_ENABLED, USDC_ADDRESS, txUrl } from '@/veltrio/network'
import { Link } from '@/veltrio/router'
import { useUsdcBalance, useWallet } from '@/veltrio/wallet'
import { findContact, useContacts, validateAddress } from '@/veltrio/contacts'
import { useSendEstimate } from '@/veltrio/sendEstimate'
import { fmtAmount, fmtFee, shortAddr } from '@/veltrio/format'
import { trackTx, useTrackedTxs } from '@/veltrio/txStore'
import { notifySubmitted } from '@/veltrio/TxWatcher'
import { runSend } from '@/veltrio/sendFlow'

type Step = 'form' | 'review' | 'sent'

function feeAsUsdcCeil(fee: Amount): Amount {
  const down = fee.toDecimals(6, 'trunc')
  return down.toDecimals(18).lt(fee) ? down.add(Amount.fromRaw(1n, 6)) : down
}

function SendFlow() {
  const { address, wrongChain, connector } = useWallet()
  const { available, reserved, isLoading: balanceLoading } = useUsdcBalance(address)
  const contacts = useContacts()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const tracked = useTrackedTxs(address)

  const [to, setTo] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [picker, setPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const submitting = useRef(false)
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID })

  const recipient = useMemo(() => (to.trim() ? validateAddress(to) : null), [to])
  const recipientAddr = recipient?.ok ? recipient.address : undefined
  const recipientError = useMemo(() => {
    if (recipient && !recipient.ok) return recipient.error
    if (recipientAddr?.toLowerCase() === USDC_ADDRESS.toLowerCase()) return 'This is the USDC token contract itself. USDC sent here would be lost.'
    if (recipientAddr === zeroAddress) return 'This is the zero address. USDC sent here would be burned.'
    return null
  }, [recipient, recipientAddr])
  const savedMatch = findContact(contacts, recipientAddr)
  const lookalike = useMemo(() => {
    if (!recipientAddr || savedMatch) return null
    const a = recipientAddr.toLowerCase()
    return contacts.find((c) => {
      const b = c.address.toLowerCase()
      return b !== a && b.slice(0, 6) === a.slice(0, 6) && b.slice(-4) === a.slice(-4)
    })
  }, [recipientAddr, savedMatch, contacts])
  const isSelf = Boolean(recipientAddr && address && recipientAddr.toLowerCase() === address.toLowerCase())

  const parsed = useMemo((): { amount: Amount | null; error: string | null } => {
    if (!amountStr.trim()) return { amount: null, error: null }
    try {
      const a = parseAmount(ACTIVE_CHAIN_ID, amountStr)
      return a.isPositive() ? { amount: a, error: null } : { amount: null, error: 'Enter an amount greater than 0.' }
    } catch (e) {
      return { amount: null, error: e instanceof AmountError && e.code === 'TOO_MANY_FRACTION_DIGITS' ? 'USDC supports up to 6 decimal places.' : 'Enter a valid amount.' }
    }
  }, [amountStr])
  const amount = parsed.amount
  const exceeds = Boolean(amount && available && amount.gt(available))

  const validInputs = Boolean(recipientAddr && !recipientError && amount && !exceeds)
  const { estimate, isEstimating, estimateError, isContract, refetch } = useSendEstimate(address, recipientAddr, amount, validInputs && !wrongChain)

  const shortfall = useMemo(() => {
    if (!estimate || !amount || !available || exceeds) return false
    return usdcToGasToken(ACTIVE_CHAIN_ID, amount).add(estimate.maxFee).gt(usdcToGasToken(ACTIVE_CHAIN_ID, available))
  }, [estimate, amount, available, exceeds])
  const maxSendable = useMemo(() => {
    if (!estimate || !available) return null
    const m = available.sub(feeAsUsdcCeil(estimate.maxFee))
    return m.isPositive() ? m : null
  }, [estimate, available])

  const canReview = Boolean(SEND_ENABLED && available && validInputs && estimate && !shortfall && !wrongChain && !isEstimating)

  const applyMax = () => {
    if (!available) return
    setAmountStr((maxSendable ?? available).toString())
  }

  const pasteAddress = async () => {
    try {
      setTo((await navigator.clipboard.readText()).trim())
    } catch {
      toast.error('Paste is blocked by your browser. Paste into the field with Ctrl/Cmd+V.')
    }
  }

  const send = async () => {
    if (!SEND_ENABLED || submitting.current || !address || !recipientAddr || !amount || !estimate || !client) return
    if (IS_MAINNET && !acknowledged) return
    submitting.current = true
    setSending(true)
    setSendError(null)
    try {
      const outcome = await runSend(
        {
          client,
          activeChainId: ACTIVE_CHAIN_ID,
          getWalletChainId: async () => connector?.getChainId(),
          writeTransfer: ({ to: recipient, amount: value, maxFeePerGas }) =>
            writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [recipient, value.raw], chainId: ACTIVE_CHAIN_ID, maxFeePerGas }),
        },
        { from: address, to: recipientAddr, amount, gas: estimate.gas, quotedMaxFeePerGas: estimate.maxFeePerGas },
      )
      if (outcome.kind === 'submitted') {
        trackTx({ hash: outcome.hash, chainId: ACTIVE_CHAIN_ID, from: address, to: recipientAddr, amountRaw: amount.raw.toString(), submittedAt: Date.now(), status: 'pending' })
        notifySubmitted(outcome.hash, amount)
        setHash(outcome.hash)
        setStep('sent')
      } else if (outcome.kind === 'blocked') {
        if (outcome.reason === 'chain') {
          setSendError(`Your wallet is on a different network. Switch to ${NETWORK_LABEL} and try again.`)
          setStep('form')
        } else if (outcome.reason === 'balance') {
          setSendError('Your balance changed and no longer covers this amount plus the network fee. Nothing was sent.')
          setStep('form')
        } else {
          setSendError('The network would reject this transfer. The recipient or your wallet may be restricted. Nothing was sent.')
        }
      } else {
        if (outcome.error.kind === 'rejected') toast.info(outcome.error.message)
        setSendError(outcome.error.message)
      }
    } finally {
      submitting.current = false
      setSending(false)
    }
  }

  const reset = () => {
    setTo('')
    setAmountStr('')
    setHash(null)
    setSendError(null)
    setAcknowledged(false)
    setStep('form')
  }

  /* ---------- Sent (tracks the real receipt) ---------- */
  if (step === 'sent' && hash && amount && recipientAddr) {
    const record = tracked.find((t) => t.hash === hash)
    const status = record?.status ?? 'untracked'
    return (
      <Card className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full" style={{ background: status === 'confirmed' ? 'rgba(111,220,155,0.14)' : status === 'failed' ? 'rgba(255,122,140,0.14)' : 'rgba(245,199,107,0.14)' }}>
          {status === 'pending' && <Loader2 className="size-8 animate-spin" style={{ color: 'var(--warn)' }} aria-label="Waiting for confirmation" />}
          {status === 'confirmed' && <CheckCircle2 className="size-8" style={{ color: 'var(--success)' }} aria-hidden />}
          {status === 'failed' && <XCircle className="size-8" style={{ color: 'var(--danger)' }} aria-hidden />}
        </div>
        <h2 className="display text-2xl font-bold" aria-live="polite">
          {status === 'pending' ? 'Waiting for confirmation' : status === 'confirmed' ? 'Transfer confirmed' : status === 'failed' ? 'Transaction failed' : 'No longer tracking'}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          {status === 'pending' && `Submitted to ${NETWORK_LABEL}. This is not final until the network confirms it.`}
          {status === 'confirmed' && `${fmtAmount(amount)} USDC was sent to ${savedMatch?.label ?? shortAddr(recipientAddr)} and confirmed onchain.`}
          {status === 'failed' && 'The transaction was included but reverted. No USDC was moved. The network fee was still charged.'}
        </p>
        <div className="mt-5 rounded-2xl px-4 py-1 text-left" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
          <Row label="Amount">{fmtAmount(amount)} USDC</Row>
          <Row label="To"><span className="mono text-xs">{recipientAddr}</span></Row>
          <Row label="Transaction hash"><span className="mono text-xs">{hash}</span></Row>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link to={`/tx/${hash}`} className="inline-flex min-h-12 items-center justify-center rounded-2xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #a5dcff 0%, #7fe3ee 100%)', color: '#06122a' }}>
            {status === 'pending' ? 'View transaction' : 'View receipt'}
          </Link>
          <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="glass inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold hover:bg-white/10">
            Arc Explorer <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
        <StalePending hash={hash} />
        <GhostButton className="mt-3 w-full" onClick={reset}>Send another</GhostButton>
      </Card>
    )
  }

  /* ---------- Review ---------- */
  if (step === 'review' && recipientAddr && amount && estimate) {
    const total = usdcToGasToken(ACTIVE_CHAIN_ID, amount).add(estimate.maxFee)
    return (
      <Card className="mx-auto max-w-lg">
        <h2 className="display text-xl font-bold">Review transaction</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Check every detail. Transfers on {NETWORK_LABEL} cannot be reversed.</p>
        <div className="mt-4 rounded-2xl p-4 text-center" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>You send</div>
          <div className="display mt-1 text-4xl font-bold tabular-nums">{fmtAmount(amount)} <span className="text-lg" style={{ color: 'var(--subtle)' }}>USDC</span></div>
        </div>
        <div className="mt-3 rounded-2xl p-4" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>Recipient</span>
            {savedMatch && <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(143,211,255,0.12)', color: 'var(--accent)' }}>Saved: {savedMatch.label}</span>}
          </div>
          <div className="mono mt-1.5 break-all text-sm leading-relaxed">{recipientAddr}</div>
        </div>
        <div className="mt-2 divide-y px-1" style={{ borderColor: 'var(--border)' }}>
          <Row label="Network">{NETWORK_LABEL} (chain {ACTIVE_CHAIN_ID}){IS_MAINNET ? ' · real funds' : ' · test funds'}</Row>
          <Row label="Estimated network fee (maximum)">≈ {fmtFee(estimate.maxFee)} USDC</Row>
          <Row label="Total including maximum fee">≈ {fmtFee(total)} USDC</Row>
        </div>
        <p className="mt-1 px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>The fee is an estimate and upper bound. The confirmed fee is shown on the receipt. On Arc the fee is paid in USDC from the same balance.</p>
        {isSelf && <Notice tone="warn" className="mt-3">You are sending to your own address.</Notice>}
        {isContract && <Notice tone="warn" className="mt-3">This address is a smart contract. Only continue if you know it can receive and handle USDC.</Notice>}
        {lookalike && <Notice tone="warn" className="mt-3">This address starts and ends like your saved address "{lookalike.label}" but is different. Scammers use look-alike addresses. Compare every character.</Notice>}
        {IS_MAINNET && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-sm" style={{ background: 'rgba(245,199,107,0.08)', border: '1px solid rgba(245,199,107,0.3)' }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-sky-300" />
            <span className="text-pretty">I checked the full recipient address above. I understand this sends real USDC on {NETWORK_LABEL} and cannot be reversed.</span>
          </label>
        )}
        {sendError && <Notice tone="danger" className="mt-3">{sendError}</Notice>}
        <div className="mt-5 space-y-3">
          <PrimaryButton onClick={() => void send()} loading={sending} disabled={sending || !SEND_ENABLED || (IS_MAINNET && !acknowledged)}>
            {sending ? 'Confirm in your wallet…' : 'Send USDC'}
          </PrimaryButton>
          <GhostButton block onClick={() => { setSendError(null); setStep('form') }} disabled={sending}><Pencil className="size-4" aria-hidden /> Edit</GhostButton>
        </div>
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--subtle)' }}>Your wallet will ask you to approve. Nothing is sent without that approval.</p>
      </Card>
    )
  }

  /* ---------- Form ---------- */
  return (
    <Card className="mx-auto max-w-lg">
      <div className="space-y-5">
        {!SEND_ENABLED && <Notice tone="warn">{SEND_DISABLED_REASON} You can still receive USDC and view your balance and history.</Notice>}
        {SEND_ENABLED && IS_MAINNET && <Notice tone="warn">You are on {NETWORK_LABEL}. Transfers use real USDC and cannot be reversed.</Notice>}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="recipient" className="text-sm font-semibold">Recipient address</label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void pasteAddress()} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold hover:bg-white/10" style={{ color: 'var(--accent)' }}>
                <ClipboardPaste className="size-3.5" aria-hidden /> Paste
              </button>
              <button type="button" onClick={() => setPicker((p) => !p)} aria-expanded={picker} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold hover:bg-white/10" style={{ color: 'var(--accent)' }}>
                <BookUser className="size-3.5" aria-hidden /> Saved
              </button>
            </div>
          </div>
          <div className="field rounded-2xl px-4 py-3">
            <input
              id="recipient"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={Boolean(recipientError)}
              aria-describedby="recipient-help"
              className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>
          <div id="recipient-help" className="mt-1.5 min-h-5 text-xs">
            {recipientError ? <span style={{ color: 'var(--danger)' }}>{recipientError}</span> : recipientAddr ? <span style={{ color: 'var(--success)' }}>{savedMatch ? `Saved address: ${savedMatch.label}` : 'Valid address'}</span> : <span style={{ color: 'var(--subtle)' }}>Double-check the full address. Transfers cannot be undone.</span>}
          </div>
          {picker && (
            <div className="mt-2 max-h-56 overflow-auto rounded-2xl p-1.5" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
              {contacts.length === 0 ? (
                <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>No saved addresses yet. <Link to="/saved" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Add one</Link>.</p>
              ) : (
                contacts.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setTo(c.address); setPicker(false) }} className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl px-3 text-left hover:bg-white/10">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{shortAddr(c.address, 10, 8)}</span>
                  </button>
                ))
              )}
              <p className="px-3 pb-2 pt-1 text-xs" style={{ color: 'var(--subtle)' }}>Selecting an address only fills the field. Nothing is sent until you review and approve.</p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="amount" className="mb-2 block text-sm font-semibold">Amount</label>
          <div className="field rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                id="amount"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  const v = e.target.value.replace(/,/g, '.')
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setAmountStr(v)
                }}
                placeholder="0.00"
                autoComplete="off"
                aria-invalid={Boolean(parsed.error || exceeds)}
                className="display w-full min-w-0 bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-600"
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--muted)' }} className="tabular-nums">
                {balanceLoading || !available ? 'Loading balance…' : `Available: ${fmtAmount(available)} USDC`}
                {reserved.isPositive() && ` (${fmtAmount(reserved)} reserved for pending)`}
              </span>
              <button type="button" onClick={applyMax} disabled={!available || available.isZero()} className="min-h-8 rounded-lg px-2 font-semibold hover:bg-white/10 disabled:opacity-40" style={{ color: 'var(--accent)' }}>Max</button>
            </div>
          </div>
          <div className="mt-1.5 min-h-5 text-xs" role="status">
            {parsed.error ? <span style={{ color: 'var(--danger)' }}>{parsed.error}</span> : exceeds ? <span style={{ color: 'var(--danger)' }}>Amount is more than your available balance.</span> : null}
          </div>
        </div>

        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'var(--surface-field)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3">
            <span style={{ color: 'var(--muted)' }}>Estimated network fee</span>
            <span className="font-semibold tabular-nums">
              {estimate ? `≈ ${fmtFee(estimate.maxFee)} USDC` : isEstimating ? <Loader2 className="inline size-4 animate-spin" aria-label="Estimating" /> : 'Enter recipient and amount'}
            </span>
          </div>
        </div>

        {shortfall && (
          <Notice tone="warn">
            Not enough left to cover the network fee after sending this amount.
            {maxSendable && <> You can send up to <button type="button" className="font-semibold underline" onClick={() => setAmountStr(maxSendable.toString())}>{fmtAmount(maxSendable)} USDC</button>.</>}
          </Notice>
        )}
        {estimateError && validInputs && (
          <Notice tone="danger">Could not estimate the fee, so this transfer may fail. <button type="button" className="font-semibold underline" onClick={() => void refetch()}>Retry</button></Notice>
        )}
        {sendError && <Notice tone="danger">{sendError}</Notice>}

        {wrongChain ? (
          <PrimaryButton loading={switching} onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID }, { onError: () => toast.error(`Could not switch to ${NETWORK_LABEL}.`) })}>
            Switch to {NETWORK_LABEL}
          </PrimaryButton>
        ) : (
          <PrimaryButton disabled={!canReview} onClick={() => { setSendError(null); setStep('review') }}>
            Review transaction
          </PrimaryButton>
        )}
      </div>
    </Card>
  )
}

/** Shown instead of the whole send flow in read-only releases: no form, no wallet prompt, no signing code path is mounted. */
function ReadOnlySend() {
  return (
    <>
      <PageHeader title="Send is not available" subtitle={`This release of Veltrio is read-only on ${NETWORK_LABEL}.`} />
      <Card className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-3xl" style={{ background: 'rgba(245,199,107,0.12)' }}>
          <XCircle className="size-7" style={{ color: 'var(--warn)' }} aria-hidden />
        </div>
        <h2 className="display text-xl font-bold">Sending is switched off</h2>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>{SEND_DISABLED_REASON}</p>
        <p className="mx-auto mt-3 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          Veltrio never signs or submits a transaction in this release. To move funds, use your own wallet directly.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link to="/receive"><GhostButton block>Receive USDC</GhostButton></Link>
          <Link to="/"><GhostButton block>Back to dashboard</GhostButton></Link>
        </div>
      </Card>
    </>
  )
}

export function Send() {
  if (!SEND_ENABLED) return <ReadOnlySend />
  return (
    <>
      <PageHeader title="Send USDC" subtitle={`Send USDC on ${NETWORK_LABEL}. You approve every transfer in your own wallet.`} />
      <ConnectGate title="Connect to send USDC">
        <SendFlow />
      </ConnectGate>
    </>
  )
}
