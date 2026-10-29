# Veltrio release-readiness review (Arc Mainnet)

Date: 2026-10-29. Two separate verdicts:

- **Mainnet READ-ONLY release: built and verified, NOT deployed.** Production builds target Arc Mainnet; sending is removed from the build. See `docs/mainnet-read-only-release.md` for the exact configuration, features, limitations and your deployment steps. The history limitation (item 14) is disclosed in the app and is accepted for this release, not solved.
- **Mainnet SENDING release: NOT READY (FAIL).** Mainnet Send is permanently off in this release and cannot be enabled by any setting. Enabling it needs a new release after items 13 and 15 are closed.

Nothing was deployed, no mainnet signing was enabled, and no transaction was submitted on any network by this review. Arc Testnet remains the default for development (`bun run dev`).

The live Netlify site (veltriofi.netlify.app) still serves the earlier testnet build.

## 1. Release-readiness checklist

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Mainnet config matches official Arc docs (chain 5042 / 0x13B2, RPC, explorer, USDC 6 decimals) | PASS | `bun run verify:docs`: 11 of 11 against the live docs pages; `bun run verify:network`: 12 of 12 against the live RPCs |
| 2 | Default (development) network is Arc Testnet; production build selects Arc Mainnet only through `.env.production` | PASS | unit test with no env override; a mistyped value falls back to testnet; security test limits `.env.production` to one public line |
| 3 | Mainnet Send permanently disabled (no environment flag exists); mainnet build contains no send UI or signing call | PASS | unit tests (every truthy flag value ignored), security test, and `verify:release` on the built files (23 of 23) |
| 4 | Exactly one code path can request a signature, behind the Send gate | PASS | `bun run test:security` (mutation-checked) |
| 5 | Lint | PASS | 0 errors, 0 warnings |
| 6 | Typecheck | PASS | `tsc --noEmit` clean |
| 7 | Automated tests | PASS | 66 of 66 (27 unit, 28 flow, 11 security) |
| 8 | Wallet-integration tests (mock wallet) | PASS | 9 of 9 |
| 9 | Production builds (mainnet production build, testnet build) | PASS | 2 of 2 built; `verify:release` passes on mainnet and correctly fails on the testnet build |
| 10 | No fake balances or mock history | PASS | code scan: no hard-coded balances, hashes or sample data; every number comes from the RPC or the history source |
| 11 | No secrets or credentials exposed | PASS | section 6 |
| 12 | Dependency advisories | FAIL (documented) | 6 open, 1 high; none in the browser bundle (section 4) |
| 13 | Real-wallet verification (MetaMask and Rabby) | NOT VERIFIED | developer-reported for MetaMask only; no evidence supplied; Rabby untested |
| 14 | Complete mainnet transaction history | FAIL | RPC-only window; provider candidate identified but not verified (section 5) |
| 15 | Independent security review | FAIL | none performed |
| 16 | Mainnet read-only release | **PASS (build verified; not deployed)** | rows 1 to 11 and `docs/mainnet-read-only-release.md`; rows 12 to 14 are disclosed limitations, not blockers for read-only use |
| 17 | Mainnet sending release | **FAIL** | blocked by 12, 13 and 15; also requires a new release because sending is removed from the mainnet build |

## 2. Exact test results (this run)

| Command | Result |
| --- | --- |
| `bun run check` | lint 0 errors / 0 warnings, typecheck clean, exit 0 |
| `bun run build` (production = mainnet read-only) | built, 86 files |
| `bun run test` | 66 PASS, 0 FAIL (units 27, flows 28, security 11) |
| `bun run test:wallet` (testnet) | 9 PASS, 0 FAIL |
| `bun run test:wallet:mainnet` (read-only) | 8 PASS, 1 SKIP (write check deliberately not run against mainnet), 0 FAIL |
| `bun run verify:network` | 12 PASS, 0 FAIL on the second run. The first run had 1 FAIL (testnet "RPC Request failed"), a transient network error that did not repeat |
| `bun run verify:docs` | 11 PASS, 0 FAIL |
| `bun run verify:release` | 23 PASS, 0 FAIL |
| `bun run build:testnet` | built (and `verify:release dist-testnet` fails as intended) |
| `bun audit` | 6 vulnerabilities (1 high, 4 moderate, 1 low) |

The security test scans the freshly built production bundle for secret patterns and for any value from `.env`.

## 3. Wallet and transaction flow verification

What each behavior is checked by. "Automated" means offline tests with a mock wallet or stub RPC. None of this is a real wallet.

| Behavior | Automated | Real wallet |
| --- | --- | --- |
| Wallet connection, address and chain exposed | yes (mock wallet) | developer-reported (MetaMask), no evidence |
| Rejected connection leaves the app disconnected | yes | not verified |
| Account change, in-wallet network change, wallet-side disconnect | yes | not verified |
| Wrong network detected, switch works, a write on the wrong chain is refused | yes | not verified |
| Fee estimate = gas x max fee, never below the 20 gwei floor, fallback to gasPrice, errors surfaced | yes | not verified |
| Fresh balance, amount + fee and fee re-check before signing | yes | not verified |
| Simulation of the exact transfer; a revert blocks signing | yes | not verified |
| User rejection (code 4001) reported calmly, wallet asked once, no retry | yes | not verified |
| Wallet-side insufficient funds; raw errors never shown | yes | not verified |
| Submitted hash is a submission, not a confirmation | yes | developer-reported |
| Pending, confirmed and failed receipts (fee labelled estimated vs confirmed) | yes | developer-reported, no evidence |
| RPC outage shows an error, not "not found" | yes | not verified |
| Timeouts and RPC errors keep a transaction pending, never failed | yes | not verified |
| Dropped transaction: stale notice after 2 minutes, stop tracking without inventing an outcome | yes | not verified (needs a manual drop test) |
| Duplicate-submit lock, "I checked the address" checkbox, look-alike address warning | code review only | not verified |

Mutation checks were done earlier: breaking the chain check, the simulation, the RPC-error handling, adding a second broadcast site, removing the Send gate and enabling mainnet Send in an env file each made a test fail.

Manual steps for MetaMask and Rabby are in `docs/manual-testing.md`. Mark real-wallet items verified only with transaction hashes or screenshots.

## 4. Dependency advisories (6 open)

Started at 35. Fixed by compatible overrides: `undici`, `@grpc/grpc-js`, `toml`, `uuid` (29 advisories), with smoke-imports of every affected package. The browser bundle was scanned (1,125 source files): none of the packages below is in it.

| Package | Severity | Advisory | Installed | Path | Actual exposure | Mitigation / why not fixed |
| --- | --- | --- | --- | --- | --- | --- |
| zod | **High** (CVSS 7.5) | GHSA-mrhx-c7xc-m3w5: memory exhaustion validating oversized constrained collections | 3.25.67 (also 3.22.4, 3.25.76) | Circle SDKs, `viem > ox > abitype`, `@coinbase/cdp-sdk` | Not in the browser bundle. Veltrio never validates untrusted collections with zod. Only the repo's server-side deploy scripts load the Circle SDKs, with local input. | Fix needs zod 4.6.6 or later, a major upgrade of an API the Circle SDKs depend on. Wait for the SDKs to move; do not override. |
| stream-json | Moderate (CVSS 6.2) | GHSA-hqr4-qq8f-hg3x: JSONC parser re-scans comments | 1.9.1 | `@solana/web3.js > jayson` | Not in the bundle; Solana client path, unused. | Fix is a major (3.x, ESM-only, changed subpaths); jayson would break. |
| stream-json | Moderate (CVSS 6.2) | GHSA-528h-pc64-c93x: filters O(depth squared) on nested input | 1.9.1 | same | same | same |
| stream-json | Moderate (CVSS 5.1) | GHSA-mjw6-4jj6-33hc: prototype pollution in the Assembler | 1.9.1 | same | same | same |
| decode-uri-component | Moderate | GHSA-vcc3-ghjq-m6fr: DoS via exponential decoding of malformed input | 0.2.2 | `wagmi > @wagmi/connectors > @walletconnect/... > query-string` | Not in the bundle. WalletConnect is not configured (injected wallets only). | Fixed releases are ESM-only (0.5.x) and would break `query-string` 7. |
| elliptic | Low (CVSS 5.6) | GHSA-848j-6mx2-7j84: risky cryptographic primitive implementation | 6.6.1 | `vite-plugin-node-polyfills > ... > crypto-browserify` | Not in the bundle. Veltrio never signs in the browser: the user's wallet signs. | No fixed version exists upstream (6.6.1 is the latest). |

Residual risk: low for users of the deployed site, because none of this code ships to browsers. Medium for developers running the repo's server-side deploy scripts. Re-run `bun audit` before each release.

## 5. Mainnet transaction history

Current mainnet behavior (default, no provider): reads USDC Transfer logs from the public RPC for roughly the last 15 hours, labelled as a limited window. It cannot list failed transactions from other apps. Failed sends made in this browser still appear. The public explorer API (explorer.arc.io/api/v2) answered HTTP 403 (Cloudflare challenge) to scripted requests and is not relied on. Testnet history uses the testnet explorer API and was verified live.

Provider research is in `docs/mainnet-history-options.md`. Result:
- **Leading candidate: Alchemy**, listed by Arc as a data indexer; its docs state Arc Mainnet support (`arc-mainnet.g.alchemy.com`) and a Transfers API.
- **Not verified, not integrated.** Open questions: double counting of native vs ERC-20 USDC, whether reverted transactions are available, timestamps on Arc, limits and cost.
- Verification tool: `ALCHEMY_API_KEY=... bun run verify:history-provider 0xAddress` (compares the provider with the RPC log scan). Never run, no key.
- If adopted, the key must live in a server-side function, never in `VITE_` variables.

Until then the correct statement is: mainnet history is partial. Do not show lifetime totals from it. The app already shows the scope and hides failed counts when they cannot be known.

## 6. Environment variables and secrets

| Item | Finding |
| --- | --- |
| Variables the app reads | `VITE_VELTRIO_NETWORK` only (public). The earlier `VITE_ENABLE_MAINNET_SEND` and `VITE_HISTORY_API_URL` switches were removed, so no provider URL or key can be placed in the browser build. Test enforced |
| `.env` in the sandbox | 1 variable (`FOO`), not `VITE_`, not used by the app, value not present in the bundle |
| Committed env files / Netlify config | only `.env.production` selects mainnet and it holds that one line; nothing else does (test enforced) |
| `.gitignore` | covers `.env`, `.env.*`, `node_modules`, `dist`, logs |
| Source scan | no private-key, mnemonic or seed identifiers; no 32-byte hex literals; no provider keys in URLs |
| Bundle scan | no PEM keys, no `sk_live_`, no Circle credential names, no `.env` values |
| Private keys / seed phrases | never requested, stored or logged; signing is done only by the user's wallet |
| Provider credentials | none in this release; the public RPC needs no key. A future keyed provider must stay behind a server-side function |

## 7. Unresolved risks

1. No real-wallet evidence for connect, sign, fee display, confirmation, failure or dropped transactions. Rabby untested.
2. Wallets may override Veltrio's fee fields; the 20 gwei floor has been checked against the docs and the RPC only.
3. A transaction dropped by the network can only be detected by timeout (2 minutes), not proven; the notice stays advisory.
4. Pending sends reserve balance until resolved or dismissed.
5. Amounts below 0.000001 USDC display as 0 (6-decimal view).
6. Mainnet history is partial (section 5); failed transactions from other apps are invisible.
7. Public RPC rate limits can slow or fail history loading; no dedicated endpoint is configured.
8. 6 open dependency advisories (section 4); the one high is outside the shipped bundle.
9. Address book lives in one browser; look-alike warning is a heuristic.
10. No independent audit; the review above is not one.

## 8. Requirements

A. Before deploying the read-only release (you do these; see `docs/mainnet-read-only-release.md` sections 7 and 8):
1. Push the tree, build with `bun run build` (no Netlify environment variables) and publish `dist` to a draft or separate site.
2. Run the post-deploy checks (network label, no Send, wrong-network banner, balance matches wallet, history notice, receipt by hash, no `eth_sendTransaction` in DevTools).
3. Promote only if every check passes; keep the previous deploy for rollback.

B. Before any mainnet sending release (a new release, not a setting):
1. Complete `docs/manual-testing.md` on testnet with MetaMask and Rabby, attach transaction hashes and screenshots, including a rejected signature, a failed transaction and a dropped transaction.
2. Obtain an independent security review of the wallet and send flows.
3. Decide how mainnet history is provided: accept the limited window with its disclosure, or verify a provider with `verify:history-provider` and add a server-side proxy.
4. Re-run `bun audit`; update or replace the Circle SDK versions when they ship zod 4, and record the outcome.
5. Restore the send flow for mainnet in the source, re-run every check and build on the exact commit, and repeat the read-only verification on mainnet first.
6. Treat the first mainnet transfer as a controlled test from a dedicated wallet with a small amount.

## 9. Commands

```bash
bun run check              # lint + typecheck
bun run test               # unit, flow and security tests (offline)
bun run test:wallet        # mock-wallet checks (testnet)
bun run test:wallet:mainnet # mock-wallet checks on chain 5042, read-only
bun run verify:network     # read-only live RPC checks
bun run verify:docs        # config vs official Arc docs
bun run build              # production build = Arc Mainnet READ-ONLY (dist/)
bun run verify:release     # inspects dist/: mainnet, no send UI, no signing calls
bun run build:testnet      # testnet build into dist-testnet/
ALCHEMY_API_KEY=... bun run verify:history-provider 0xAddress   # optional, provider check
```
