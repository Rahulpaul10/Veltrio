/**
 * Network-configuration check against Arc's official documentation (read-only, no wallet, no transactions).
 * Fetches the live docs pages and confirms every value Veltrio ships appears in them.
 *
 *   bun run verify:docs
 */
import { VERIFIED_NETWORKS } from '../src/veltrio/network'

const DOCS = 'https://docs.arc.io/arc/references'
const get = async (path: string): Promise<string> => {
  const response = await fetch(`${DOCS}/${path}.md`)
  if (!response.ok) throw new Error(`Could not read ${path}: HTTP ${response.status}`)
  return response.text()
}

const [rpcPage, addressPage, connectPage] = await Promise.all([get('rpc-endpoints'), get('contract-addresses'), get('connect-to-arc')])

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed += 1
}

for (const key of ['mainnet', 'testnet'] as const) {
  const v = VERIFIED_NETWORKS[key]
  check(rpcPage.includes(`\`${v.chainId}\``), `${key}: chain ID ${v.chainId} is listed on the RPC endpoints page`)
  if (key === 'mainnet') check(`0x${v.chainId.toString(16).toUpperCase()}` === '0x13B2', 'mainnet: chain ID 5042 is 0x13B2 in hex')
  check(rpcPage.includes(v.rpcUrl), `${key}: RPC ${v.rpcUrl} is listed`)
  check(rpcPage.includes(v.explorer.replace('https://', '')), `${key}: explorer ${v.explorer} is listed`)
  const section = addressPage.split(key === 'mainnet' ? '**Mainnet**' : '**Testnet**')[1] ?? ''
  check(section.slice(0, 700).toLowerCase().includes(v.usdc.toLowerCase()), `${key}: USDC contract ${v.usdc} is the listed USDC address`)
}
check(addressPage.includes('Uses 6 decimals'), 'docs state the USDC ERC-20 interface uses 6 decimals')
check(connectPage.includes('5042'), 'connect-to-arc page lists the mainnet chain ID 5042')

console.log(failed === 0 ? '\nAll documentation checks passed.' : `\n${failed} documentation check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
