import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { decodeFunctionData, erc20Abi, parseEventLogs, TransactionNotFoundError, TransactionReceiptNotFoundError, type PublicClient } from 'viem'
import { Amount } from '@/onchain-money'
import { ACTIVE_CHAIN_ID, USDC_ADDRESS } from './network'
import type { ItemStatus } from './history'

export interface ReceiptData {
  hash: `0x${string}`
  status: ItemStatus
  /** The wallet that signed and paid for the transaction. */
  sender: string
  /** transfer: a USDC movement was identified. contract: no direct USDC transfer was found. */
  kind: 'transfer' | 'contract'
  /** USDC mover and recipient (transfer only). */
  payer: string | null
  payee: string | null
  /** 6-decimal USDC view. */
  amount: Amount | null
  /** Fee in the 18-decimal gas view. `confirmed` only when a receipt exists. */
  fee: Amount | null
  feeKind: 'confirmed' | 'estimated' | null
  timestamp: number | null
  blockNumber: bigint | null
  method: string | null
}

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase()

/** Only a genuine "not found" answer becomes null. Any other RPC failure throws, so the UI shows an error, not "not found". */
function notFoundToNull(NotFound: new (...args: never[]) => Error) {
  return (error: unknown): null => {
    if (error instanceof NotFound) return null
    throw error
  }
}

export async function loadReceipt(client: Pick<PublicClient, 'getTransaction' | 'getTransactionReceipt' | 'getBlock'>, hash: `0x${string}`): Promise<ReceiptData | null> {
  const h = hash
  const tx = await client.getTransaction({ hash: h }).catch(notFoundToNull(TransactionNotFoundError))
  if (!tx) return null
  const receipt = await client.getTransactionReceipt({ hash: h }).catch(notFoundToNull(TransactionReceiptNotFoundError))
  const block = receipt ? await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null) : null

  let kind: ReceiptData['kind'] = 'contract'
  let payer: string | null = null
  let payee: string | null = null
  let amount: Amount | null = null
  let method: string | null = null

  if (lower(tx.to) === lower(USDC_ADDRESS)) {
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input })
      method = decoded.functionName
      if (decoded.functionName === 'transfer') {
        const [to, value] = decoded.args
        kind = 'transfer'
        payer = tx.from
        payee = to
        amount = Amount.fromRaw(value, 6)
      }
    } catch {
      // Not an ERC-20 call we recognise: fall through to log inspection.
    }
  }

  if (kind === 'contract' && tx.input === '0x' && tx.value > 0n && tx.to) {
    kind = 'transfer'
    payer = tx.from
    payee = tx.to
    amount = Amount.fromRaw(tx.value, 18).toDecimals(6, 'trunc')
  }

  if (kind === 'contract' && receipt) {
    const logs = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs }).filter((l) => lower(l.address) === lower(USDC_ADDRESS))
    if (logs.length === 1) {
      // One USDC movement inside a contract call: show it, but it stays a contract interaction.
      const log = logs[0]
      payer = log.args.from
      payee = log.args.to
      amount = Amount.fromRaw(log.args.value, 6)
    }
  }

  const status: ItemStatus = receipt ? (receipt.status === 'success' ? 'success' : 'failed') : 'pending'
  let fee: Amount | null = null
  let feeKind: ReceiptData['feeKind'] = null
  if (receipt) {
    fee = Amount.fromRaw(receipt.gasUsed * receipt.effectiveGasPrice, 18)
    feeKind = 'confirmed'
  } else {
    const perGas = tx.maxFeePerGas ?? tx.gasPrice
    if (perGas) {
      fee = Amount.fromRaw(tx.gas * perGas, 18)
      feeKind = 'estimated'
    }
  }

  return {
    hash: h,
    status,
    sender: tx.from,
    kind,
    payer,
    payee,
    amount,
    fee,
    feeKind,
    timestamp: block ? Number(block.timestamp) * 1000 : null,
    blockNumber: receipt?.blockNumber ?? null,
    method,
  }
}

export function useReceiptData(hash: string) {
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID })
  const valid = /^0x[0-9a-fA-F]{64}$/.test(hash)
  return useQuery<ReceiptData | null>({
    queryKey: ['veltrio', 'receipt', hash.toLowerCase()],
    enabled: Boolean(client && valid),
    retry: 1,
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'pending' ? false : 4_000),
    queryFn: () => (client ? loadReceipt(client, hash as `0x${string}`) : Promise.resolve(null)),
  })
}
