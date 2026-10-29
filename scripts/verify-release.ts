/**
 * Inspects the BUILT mainnet read-only release in dist/ (no network access, no wallet).
 *
 *   bun run build && bun run verify:release   (optionally: bun run verify:release dist-testnet, which must FAIL)
 *
 * It proves what ships: Arc Mainnet is selected, the read-only explanation is present, and the
 * send flow and every signing call are absent from the application code.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), process.argv[2] ?? 'dist')
let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed += 1
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]))

if (!existsSync(DIST)) {
  console.log('FAIL  dist/ does not exist. Run `bun run build` first.')
  process.exit(1)
}

const files = walk(DIST)
const appChunks = files.filter((f) => /assets\/index-[^/]*\.js$/.test(f))
const app = appChunks.map((f) => readFileSync(f, 'utf8')).join('\n')
const has = (s: string) => app.includes(s)

check(existsSync(join(DIST, 'index.html')), 'index.html present')
check(existsSync(join(DIST, '_redirects')) && existsSync(join(DIST, '_headers')), 'Netlify _redirects and _headers present')
check(files.every((f) => !f.endsWith('.map')), 'no source maps shipped')
check(appChunks.length > 0, 'application chunks found', `${appChunks.length}`)

for (const marker of ['Arc Mainnet', 'rpc.mainnet.arc.io', 'explorer.arc.io', 'This is a read-only release', 'Send is not available', 'Limited history']) {
  check(has(marker), `contains "${marker}"`)
}

// Send UI strings, signing method names and the testnet faucet must be absent from the application code.
const forbidden = [
  'Confirm in your wallet', 'I checked the full recipient address', 'Review transaction', 'Estimated network fee', 'Use in Send',
  'writeContract', 'sendTransaction', 'eth_sendTransaction', 'personal_sign', 'signTypedData', 'signMessage', 'faucet.circle.com', 'Get test USDC',
]
for (const marker of forbidden) check(!has(marker), `application code does NOT contain "${marker}"`)

const digest = createHash('sha256')
for (const f of files.sort()) digest.update(f.slice(DIST.length)).update(readFileSync(f))
console.log(`\nRelease fingerprint (sha256 over all files in dist/): ${digest.digest('hex')}`)
console.log(`Files: ${files.length}, application chunks: ${appChunks.length}`)

console.log(failed === 0 ? '\nRelease verification passed: Arc Mainnet, read-only, no send flow in the build.' : `\n${failed} release check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
