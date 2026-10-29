import { NETWORK_LABEL } from './network'

export type TxErrorKind = 'rejected' | 'insufficient' | 'network' | 'reverted' | 'chain' | 'other'

export interface ParsedTxError {
  kind: TxErrorKind
  message: string
}

interface ErrorLike {
  code?: number
  name?: string
  shortMessage?: string
  message?: string
  cause?: unknown
}

function chain(error: unknown): ErrorLike[] {
  const list: ErrorLike[] = []
  let current: unknown = error
  for (let i = 0; i < 6 && current && typeof current === 'object'; i++) {
    list.push(current)
    current = (current as ErrorLike).cause
  }
  return list
}

/** Turns wallet / RPC errors into short, user-facing text. Raw errors never reach the UI. */
export function parseTxError(error: unknown): ParsedTxError {
  const errors = chain(error)
  const text = errors
    .map((e) => `${e.name ?? ''} ${e.shortMessage ?? ''} ${e.message ?? ''}`)
    .join(' ')
    .toLowerCase()

  if (errors.some((e) => e.code === 4001 || e.code === 5750) || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
    return { kind: 'rejected', message: 'You rejected the request in your wallet. Nothing was sent.' }
  }
  if (text.includes('insufficient funds') || text.includes('exceeds balance') || text.includes('transfer amount exceeds')) {
    return { kind: 'insufficient', message: 'Not enough USDC to cover the amount plus the network fee.' }
  }
  if (text.includes('chain mismatch') || text.includes('does not match the target chain') || text.includes('unrecognized chain')) {
    return { kind: 'chain', message: `Your wallet is on a different network. Switch to ${NETWORK_LABEL} and try again.` }
  }
  if (text.includes('revert')) {
    return { kind: 'reverted', message: 'The network rejected this transaction. The recipient or sender may be restricted, or the balance changed.' }
  }
  if (text.includes('timeout') || text.includes('timed out') || text.includes('fetch') || text.includes('network') || text.includes('http request failed') || text.includes('rpc')) {
    return { kind: 'network', message: `Could not reach the ${NETWORK_LABEL} RPC. Check your connection and retry.` }
  }
  return { kind: 'other', message: 'Something went wrong. Nothing was sent. Please try again.' }
}
