# Veltrio on Arc Mainnet: read-only release

Status: **built, NOT deployed.** Date: 2026-10-29. This release can connect a wallet and show real USDC data on Arc Mainnet. It cannot sign or send anything, and there is no setting that turns sending on.

Release fingerprint (sha256 over all 86 files in `dist/`, built from this tree): `6313b810ddcd3cced8ceaa7d80f918ba393e1c30aa836cf8aa2d57a392a3d60d`

## 1. Exact network configuration

| Setting | Value | Verified against |
| --- | --- | --- |
| Network name | Arc (shown as "Arc Mainnet") | docs.arc.io |
| Chain ID | 5042 (hex `0x13B2`) | docs.arc.io RPC endpoints page; live `eth_chainId` returned `0x13b2` |
| RPC URL | `https://rpc.mainnet.arc.io` | docs.arc.io RPC endpoints page; live calls |
| Native currency | USDC, 18 decimals (native view) | docs.arc.io EVM differences |
| Block explorer | `https://explorer.arc.io` | docs.arc.io RPC endpoints page |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000`, 6 decimals | docs.arc.io Contract addresses page; live `symbol()` = USDC, `decimals()` = 6, contract has code |

Native and ERC-20 USDC are one balance (live check: native ÷ 10^12 equals `balanceOf`). Veltrio shows one USDC amount.

Re-check at any time with `bun run verify:docs` (reads the official docs) and `bun run verify:network` (read-only RPC calls). The app also refuses to start if its configuration ever differs from the values above.

How the network is chosen:
- `bun run build` (production) reads `.env.production`, which sets `VITE_VELTRIO_NETWORK=mainnet`. This is the only environment value the app reads. It is public and holds no secret.
- `bun run dev` and every unconfigured run default to Arc Testnet.
- `bun run build:testnet` builds a testnet version into `dist-testnet/` (sending enabled, test funds only).
- Any value other than the exact string `mainnet` means testnet.

## 2. What read-only means here

- `SEND_ENABLED` is `false` on mainnet in the source. There is no environment variable, query string or setting that changes it.
- The mainnet bundle contains no send form and no signing call. `bun run verify:release` checks the built files and fails if any of these appear: the send screens, `writeContract`, `sendTransaction`, `eth_sendTransaction`, `personal_sign`, `signTypedData`, `signMessage`.
- `/send` shows an explanation page. The Send entry is removed from navigation, the dashboard and saved addresses.
- The only prompts a wallet can receive are connect, and switch or add network (EIP-3326 and EIP-3085). Neither is a transaction.
- Libraries bundled for wallet connection still contain generic wallet code (for example the wallet library's own `eth_sendTransaction` string in separate vendor chunks). Veltrio's own code never calls it, and the security test allows exactly one signing call site, which is not shipped on mainnet.

## 3. Features in this release

| Feature | Status | Evidence |
| --- | --- | --- |
| Wallet connect and disconnect (MetaMask, Rabby and other injected wallets) | Works | Mock-wallet tests on chain 5042 (connect, disconnect, account change, network change). Real-wallet use not tested by Arc Studio. |
| Wrong-network warning and switch or add Arc Mainnet | Works | Mock-wallet tests; wallet add-network prompt uses the verified parameters |
| Real USDC balance | Works | Live `balanceOf` read on Arc Mainnet through the app's code path; native and ERC-20 views reconciled |
| Token information (USDC address, decimals, gas note) | Works | Dashboard card built from the verified configuration |
| Receive (address, QR code) | Works | Shows the connected wallet address only |
| Transaction history | Limited (see 4) | Live RPC log scan on mainnet addresses |
| Transaction receipts by hash | Works | Read from RPC; tests for pending, confirmed, failed, not found, RPC error |
| Activity summary | Limited (see 4) | Counts only the loaded window |
| Saved addresses | Works | Stored in this browser only |
| Send, signing, fee estimate, notifications for submitted transactions | Not in this release | Removed from the mainnet build |

## 4. Known limitations (shown to users in the app)

- **History is a recent window, not the full history.** Mainnet history is read directly from the Arc RPC (USDC Transfer logs). It covers about the last 15 hours (12 log queries of up to 9,000 blocks each; measured at about 0.5 s per block). The app states the exact start time on the dashboard, Transactions and Activity pages.
- **Failed transactions from other apps are not listed.** Reverted transactions emit no logs, so the RPC cannot find them. The Failed count is shown as unavailable.
- **No lifetime totals.** Sent and received totals appear only for the loaded window and are labelled that way. An empty list is described as "nothing found in the recent window", never as "no history".
- **Public RPC limits.** The public RPC rate-limits bursts of log queries. History can take several seconds to load or fail with a retry button.
- **No complete-history provider is integrated.** The public explorer API returned HTTP 403 (Cloudflare challenge) to scripted requests. Alchemy is the leading candidate but is not verified. See `docs/mainnet-history-options.md`. The release contains no provider, no provider URL and no provider key.
- **Amounts below 0.000001 USDC** exist only in the native view and show as zero.
- **No fiat valuations.** Veltrio does not show USD prices.
- **Browser wallets only** (injected). WalletConnect is not configured.
- **Saved addresses and pending-transaction notes live in this browser** and do not sync between devices.

## 5. Secrets and credentials

- The browser bundle contains no private key, API key, provider credential or token. `bun run test:security` scans the built files for secret patterns and for any value from `.env`.
- The only environment variable the app reads is the public `VITE_VELTRIO_NETWORK`. `.env.production` may contain only that line (enforced by the security test).
- The RPC used is Circle's public endpoint, which accepts anonymous requests. No key is needed.
- `.env` and other `.env.*` files are git-ignored. Only `.env.production` is tracked.

## 6. Test results for this build

Run on this tree on 2026-10-29. Everything is offline or read-only. No wallet, no signature, no transaction.

| Check | Result |
| --- | --- |
| `bun run check` (lint, typecheck) | 0 errors, 0 warnings, typecheck passed |
| `bun run build` (production, mainnet) | built, 86 files |
| `bun run test:security` | 11 of 11 passed |
| `bun run test` (units 27, flows 28, security 11) | 66 of 66 passed |
| `bun run test:wallet` (testnet) | 9 of 9 passed |
| `bun run test:wallet:mainnet` (read-only) | 8 passed, 1 deliberately skipped (never calls a write against mainnet) |
| `bun run verify:network` | 12 of 12 passed on the second run; the first run had one failure, a transient testnet RPC request failure ("RPC Request failed"), which did not repeat |
| `bun run verify:docs` | 11 of 11 passed |
| `bun run verify:release` | 23 of 23 passed |
| `bun run build:testnet` | built; `verify:release dist-testnet` correctly FAILS (it is not a read-only mainnet build) |
| `bun audit` | 6 advisories (1 high, 4 moderate, 1 low), none in the browser bundle; see `docs/safety-review.md` |

Not tested: any real wallet (MetaMask, Rabby), a deployed copy of this build, a phone browser, printing, QR scanning, behaviour under sustained RPC rate limiting.

## 7. Deployment steps (you perform these; Arc Studio did not deploy)

The existing site `veltriofi.netlify.app` serves the earlier testnet build. Deploying this release to the same site would replace it. Recommended: keep the testnet site for testing and create a separate site for mainnet.

1. Commit and push this tree to your repository (Arc Studio sidebar, or git).
2. In Netlify, create a new site from the repository.
   - Build command: `bun run build`
   - Publish directory: `dist`
   - Environment variables: none. Do not set `VITE_VELTRIO_NETWORK` in Netlify (a value there overrides `.env.production`). Never add keys or secrets as `VITE_` variables, because they are shipped to every visitor.
   - If your Netlify build image does not provide `bun`, build locally with `bun install && bun run build` and upload the `dist` folder with the Netlify CLI (`netlify deploy --dir=dist`, then `--prod` after checking the draft URL).
3. Before promoting, open the draft URL and run the post-deploy checks below.
4. Promote to production only after every check passes.
5. Rollback: in Netlify, Deploys, choose the previous deploy and "Publish deploy".

For a testnet site: build with `bun run build:testnet` and publish `dist-testnet`.

## 8. Post-deploy checks (on the deployed URL)

1. The header shows "Arc Mainnet" and the sidebar says "Read-only release".
2. There is no Send item in navigation, and `/send` shows "Send is not available".
3. Connect a wallet that is on another network. The warning banner appears; "Switch" opens a network prompt for chain 5042 with RPC `https://rpc.mainnet.arc.io`.
4. Your USDC balance matches your wallet's balance.
5. Dashboard, Transactions and Activity all show the "Limited history" notice with a start time.
6. Open DevTools, Network tab, and use the app. Confirm there are no requests to anything except the Arc RPC, fonts, and the site itself, and no `eth_sendTransaction`.
7. Paste a known mainnet transaction hash into `/tx/<hash>`; the receipt loads from the RPC.
8. Run `bun run verify:release` against a local build of the same commit and compare the fingerprint with section top. Differences can come from a different build environment; in that case rely on checks 1 to 7.

## 9. Before anyone enables sending on mainnet (not part of this release)

Sending would need a new release, not a setting: restore the send flow for mainnet in the source, complete the real-wallet checks in `docs/manual-testing.md` on testnet with evidence, close or accept every item in `docs/safety-review.md`, and obtain an independent security review.
