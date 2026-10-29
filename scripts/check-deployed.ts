// Compares a LIVE site with the verified local dist/ build. Read-only HTTP GETs only.
// Usage: bun run verify:deployed https://your-new-site.netlify.app
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const base = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!/^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(base)) {
  console.error('Usage: bun run verify:deployed https://your-new-site.netlify.app')
  process.exit(2)
}
const DIST = join(process.cwd(), 'dist')
const SKIP = new Set(['_redirects', '_headers'])
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

let failed = 0
const check = (ok: boolean, name: string, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function get(path: string) {
  const res = await fetch(base + path, { redirect: 'follow' })
  return { res, body: new Uint8Array(await res.arrayBuffer()) }
}

const files = walk(DIST)
  .map((f) => relative(DIST, f).split('\\').join('/'))
  .filter((f) => !SKIP.has(f))

const home = await get('/')
check(home.res.status === 200, 'home page responds 200', String(home.res.status))
const protectedSite = home.res.status === 401 || /password|sign in|log in/i.test(new TextDecoder().decode(home.body).slice(0, 4000)) && !/id="root"/.test(new TextDecoder().decode(home.body))
check(!protectedSite, 'site is publicly reachable (no Netlify access protection page)')

let mismatches = 0
let missing = 0
const queue = [...files]
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    try {
      const { res, body } = await get('/' + f)
      if (res.status !== 200) missing++
      else if (sha(body) !== sha(readFileSync(join(DIST, f)))) mismatches++
    } catch {
      missing++
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
check(missing === 0, `all ${files.length} verified files are served`, `${missing} missing`)
check(mismatches === 0, 'every served file is byte-identical to the verified dist/', `${mismatches} different`)

const index = readFileSync(join(DIST, 'index.html'))
for (const path of ['/send', '/transactions', '/tx/0x' + 'ab'.repeat(32)]) {
  const r = await get(path)
  check(r.res.status === 200 && sha(r.body) === sha(index), `deep link ${path.slice(0, 12)} serves the app`, String(r.res.status))
}
const nosniff = home.res.headers.get('x-content-type-options')
check(nosniff === 'nosniff', 'security header x-content-type-options: nosniff')
check(Boolean(home.res.headers.get('referrer-policy')), 'security header referrer-policy present')

console.log(failed ? `\n${failed} check(s) failed. Do not use this site.` : '\nDeployed site matches the verified Arc Mainnet read-only build.')
process.exit(failed ? 1 : 0)
