/**
 * Static security checks: single broadcast site, send gating, environment variables and secrets.
 * Offline, read-only. It prints variable NAMES only, never values.
 *
 *   bun run test:security
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
let failed = 0
const test = (name: string, fn: () => void) => {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const appFiles = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !/(tracing|console-capture|onchain-facts)\.ts$/.test(f))
const rel = (f: string) => relative(ROOT, f)
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('exactly one place can ask a wallet to sign or broadcast, and it is the Send page', () => {
  const hits = appFiles
    .map((f) => ({ f: rel(f), code: stripComments(readFileSync(f, 'utf8')) }))
    .filter(({ code }) => /\b(writeContractAsync|writeContract|sendTransactionAsync|sendTransaction|sendRawTransaction|signMessage|signTypedData|eth_sendTransaction|personal_sign)\b/.test(code))
  assert.deepEqual(hits.map((h) => h.f), ['src/pages/Send.tsx'])
  const calls = stripComments(read('src/pages/Send.tsx')).match(/writeContractAsync\(/g) ?? []
  assert.equal(calls.length, 1, 'one writeContractAsync call')
})

test('Send page refuses to run when Send is disabled, before anything else', () => {
  const code = stripComments(read('src/pages/Send.tsx'))
  const start = code.indexOf('const send = async')
  assert.ok(start > 0)
  const guard = code.indexOf('!SEND_ENABLED', start)
  const run = code.indexOf('runSend(', start)
  assert.ok(guard > 0 && run > 0 && guard < run, 'SEND_ENABLED guard comes before runSend')
})

test('the Send page renders only a read-only explanation when Send is disabled (no form, no wallet prompt)', () => {
  const code = stripComments(read('src/pages/Send.tsx'))
  const outer = code.slice(code.indexOf('export function Send()'))
  assert.match(outer, /if \(!SEND_ENABLED\) return <ReadOnlySend \/>/)
  assert.ok(outer.indexOf('!SEND_ENABLED') < outer.indexOf('<SendFlow'), 'guard precedes the flow')
  assert.match(code, /canReview = Boolean\(SEND_ENABLED/)
})

test('the send flow simulates first, then asks the wallet (never the other way round)', () => {
  const code = stripComments(read('src/veltrio/sendFlow.ts'))
  assert.ok(code.indexOf('sendPreflight(') > 0 && code.indexOf('sendPreflight(') < code.indexOf('deps.writeTransfer('))
  assert.ok(code.indexOf('walletChain !== deps.activeChainId') < code.indexOf('sendPreflight('))
})

test('SEND_ENABLED is true on testnet only; there is no environment flag for mainnet', () => {
  const code = stripComments(read('src/veltrio/network.ts'))
  assert.match(code, /SEND_ENABLED: boolean = IS_TESTNET\b/)
  assert.doesNotMatch(code, /ENABLE_MAINNET_SEND/)
})

test('network defaults to testnet; mainnet needs the exact value "mainnet"', () => {
  assert.match(stripComments(read('src/veltrio/network.ts')), /NETWORK: NetworkId = import\.meta\.env\.VITE_VELTRIO_NETWORK === 'mainnet' \? 'mainnet' : 'testnet'/)
})

test('the app reads exactly one public VITE_ variable (the network) and nothing secret-looking', () => {
  const names = new Set<string>()
  for (const f of appFiles) for (const m of readFileSync(f, 'utf8').matchAll(/VITE_[A-Z0-9_]+/g)) names.add(m[0])
  assert.deepEqual([...names].sort(), ['VITE_VELTRIO_NETWORK'])
  for (const n of names) assert.doesNotMatch(n, /KEY|SECRET|TOKEN|PRIVATE|PASSWORD|MNEMONIC/)
})

test('only .env.production selects mainnet, and it holds nothing but that one public value', () => {
  const others = ['.env', '.env.local', '.env.development', 'netlify.toml', 'public/_headers', 'public/_redirects'].filter((p) => existsSync(join(ROOT, p)))
  for (const p of others) {
    assert.doesNotMatch(read(p), /VITE_VELTRIO_NETWORK\s*=\s*"?mainnet/i, `${p} must not select mainnet`)
    assert.doesNotMatch(read(p), /VITE_ENABLE_MAINNET_SEND|VITE_HISTORY_API_URL/i, `${p} must not carry removed switches`)
  }
  const lines = read('.env.production').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  assert.deepEqual(lines, ['VITE_VELTRIO_NETWORK=mainnet'])
})

test('.gitignore keeps .env, node_modules and build output out of git (only .env.production is tracked)', () => {
  const text = read('.gitignore')
  for (const entry of ['.env', '.env.*', '!.env.production', 'node_modules/', 'dist/', 'dist-testnet/']) assert.ok(text.split('\n').includes(entry), `${entry} is in .gitignore`)
})

test('source code holds no key material, seed handling or provider keys', () => {
  const files = [...appFiles, ...walk(join(ROOT, 'scripts')).filter((f) => f.endsWith('.ts') && !f.endsWith('test-security.ts'))]
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'))
    assert.doesNotMatch(code, /\b(privateKey|mnemonic|seedPhrase|secretKey)\b/i, `${rel(f)}: key material identifier`)
    assert.doesNotMatch(code, /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/, `${rel(f)}: 32-byte hex literal`)
    assert.doesNotMatch(code, /(alchemy|infura|quiknode|quicknode|drpc)[^'"\s]*\/v2\/[A-Za-z0-9_-]{16,}/i, `${rel(f)}: provider key in URL`)
  }
})

test('production bundle (if built) contains no secret patterns and no value from .env', () => {
  if (!existsSync(join(ROOT, 'dist/assets'))) {
    console.log('      (skipped: run "bun run build" first)')
    return
  }
  const bundle = walk(join(ROOT, 'dist')).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
  assert.doesNotMatch(bundle, /-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_|CIRCLE_API_KEY|ENTITY_SECRET|TEST_API_KEY:/)
  if (existsSync(join(ROOT, '.env'))) {
    for (const line of read('.env').split('\n')) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
      if (!m || m[1].startsWith('VITE_')) continue
      const value = m[2].replace(/^["']|["']$/g, '')
      if (value.length >= 8) assert.ok(!bundle.includes(value), `value of ${m[1]} must not appear in the bundle`)
    }
  }
})

console.log(failed === 0 ? '\nAll security checks passed.' : `\n${failed} security check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
