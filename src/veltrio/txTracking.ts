import type { PublicClient } from 'viem'
import type { TrackedTx } from './txStore'

/** Arc finalizes in under a second; still pending after this long means the network may have dropped it. */
export const STALE_AFTER_MS = 120_000

export function isStalePending(tx: Pick<TrackedTx, 'status' | 'submittedAt'>, now: number): boolean {
  return tx.status === 'pending' && now - tx.submittedAt >= STALE_AFTER_MS
}

export interface TxOutcome {
  status: 'confirmed' | 'failed'
  /** Fee actually charged, 18-decimal gas view. */
  feeRaw: string
  blockNumber: string
}

export interface WaitOptions {
  signal?: AbortSignal
  timeoutMs?: number
  pollingIntervalMs?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export class WaitAborted extends Error {
  constructor() {
    super('Stopped waiting for the transaction')
    this.name = 'WaitAborted'
  }
}

type ReceiptClient = Pick<PublicClient, 'waitForTransactionReceipt'>

/**
 * Resolves ONLY when a real receipt exists. Timeouts and RPC errors are never treated as an outcome:
 * the transaction stays pending and the wait is retried. The only other way out is an abort.
 */
export async function waitForOutcome(client: ReceiptClient, hash: `0x${string}`, options: WaitOptions = {}): Promise<TxOutcome> {
  const { signal, timeoutMs = 90_000, pollingIntervalMs = 2_000, retryDelayMs = 3_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options
  for (;;) {
    if (signal?.aborted) throw new WaitAborted()
    try {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: pollingIntervalMs })
      if (signal?.aborted) throw new WaitAborted()
      return {
        status: receipt.status === 'success' ? 'confirmed' : 'failed',
        feeRaw: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        blockNumber: receipt.blockNumber.toString(),
      }
    } catch (error) {
      if (error instanceof WaitAborted) throw error
      if (signal?.aborted) throw new WaitAborted()
      await sleep(retryDelayMs)
    }
  }
}
