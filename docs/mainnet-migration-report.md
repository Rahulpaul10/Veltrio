> **SUPERSEDED.** The switches `VITE_ENABLE_MAINNET_SEND` and `VITE_HISTORY_API_URL` described below no longer exist. The current release is read-only; see `docs/mainnet-read-only-release.md` and `docs/safety-review.md`.

# Veltrio: Arc Mainnet migration report

Date: 2026-10-29. Status: prepared, NOT deployed. Superseded on defaults by docs/safety-review.md: the app now defaults to TESTNET, and mainnet needs VITE_VELTRIO_NETWORK=mainnet plus VITE_ENABLE_MAINNET_SEND=true for Send.

Veltrio has not been independently audited. Nothing in this report is a claim that mainnet transfers work: no transaction of any kind was sent during this work.

## 1. Files and configuration changed

| File | Change |
| --- | --- |
| `src/veltrio/network.ts` | Rewritten. Build-time network choice (mainnet default), verified-values self-check that stops the app on any mismatch, send gate, history source selection, 20 gwei fee floor constant |
| `src/config.ts` | Only the active chain is configured, built from verified values so "add network" in a wallet uses exact parameters |
| `src/veltrio/rpcHistory.ts` (new) | RPC-only history for mainnet (see section 5) |
| `src/veltrio/history.ts` | Source selection (indexer or RPC), `source` and `failedVisible` flags |
| `src/veltrio/sendEstimate.ts` | maxFeePerGas clamped to at least 20 gwei and returned for submission |
| `src/pages/Send.tsx` | Send gate, mainnet acknowledgement checkbox, fresh balance check and transfer simulation right before the wallet prompt, explicit maxFeePerGas, look-alike address warning |
| `src/components/StalePending.tsx` (new) | Pending over 2 minutes: explains possible drop, lets the user stop tracking, never guesses failure |
| `Shell`, `NetworkStatus`, `WalletMenu`, `ConnectGate`, `Dashboard`, `Activity`, `Transactions`, `Receipt`, `Receive`, `errors.ts` | Copy now follows the active network ("Arc Mainnet" vs "Arc Testnet"); mainnet real-funds notices; failed-transaction stats shown as unavailable when RPC-only |
| `scripts/test-units.ts`, `scripts/verify-network.ts` (new) | Offline unit checks and read-only live network checks |
| `package.json` | Added `build`, `test`, `verify:network` scripts |
| `public/_redirects`, `public/_headers` (new) | SPA fallback for deep links, basic security headers |
| `README.md`, `AGENTS.md` | Updated |

Not changed: layout, branding, navigation, saved addresses, receipts layout, notifications.

## 2. Arc Mainnet settings verified

Checked against docs.arc.io (RPC endpoints, Contract addresses, Add Arc to a wallet, EVM differences, Transaction lifecycle, USDC system events) and live JSON-RPC calls.

| Setting | Value | Verified |
| --- | --- | --- |
| Chain ID | 5042 (0x13B2) | Docs table and live `eth_chainId` returned 0x13b2 |
| RPC | https://rpc.mainnet.arc.io | Docs list it as the primary endpoint (anonymous, open CORS) |
| Explorer | https://explorer.arc.io | Docs network parameters table |
| Native currency | USDC, 18 decimals | Docs |
| USDC ERC-20 interface | 0x3600000000000000000000000000000000000000, 6 decimals | Docs contract addresses; live: symbol USDC, decimals 6, contract code present |
| One pool, two views | native / 10^12 equals `balanceOf` | Live check on a funded mainnet address |
| Fee floor | 20 gwei maxFeePerGas minimum | Docs (EVM differences, wallet guide). Live RPC quote was about 24 gwei |

Docs facts that shaped the code: Arc has no confirmation counter (pending or final), reverted transactions still consume gas, transfers to the zero address revert, blocklisted addresses revert, transactions under 20 gwei are silently dropped.

No testnet address or contract was assumed to exist on mainnet. There are no custom contracts.

## 3. Features implemented

Wallet connect/disconnect, account and network change detection, wrong-network banner with switch/add, single USDC balance (ERC-20 view) with loading and error states, Send with the full safeguard list below, Receive with QR, history, receipts (confirmed vs estimated fee labels), activity summary with scope disclosure, saved addresses, in-app notifications.

Send safeguards: strict address validation (checksum enforced for mixed case), blocks the USDC contract and zero address, amount precision check (6 decimals), available vs reserved-for-pending, fee estimate with 20 gwei floor, amount + fee check, wallet chain verified on every send, balance re-read and transfer simulated immediately before the wallet prompt, explicit approval in the wallet, duplicate-submit guard, mainnet acknowledgement checkbox, success shown only from a real receipt.

## 4. Tests actually performed

| Test | Result |
| --- | --- |
| `bun run check` (lint + typecheck) | 0 errors, 0 warnings |
| `bun run test` (11 offline unit checks: config vs verified values, decimals, address validation, address book, stats double-counting, error mapping) | all passed |
| Production build, mainnet configuration | succeeded |
| Production build, testnet configuration | succeeded |
| `bun run verify:network`, mainnet (read-only): chain ID, USDC symbol/decimals/code, native vs ERC-20 parity, `eth_estimateGas` simulation of a USDC transfer (nothing broadcast) | all passed |
| Same checks on testnet | all passed |
| RPC history on mainnet, read-only, two addresses | quiet address: 2 items in about 8 s; very busy address: truncated and slow (about 38 s before the cap was lowered). Public RPC rate limiting was observed during these runs |
| Explorer API on mainnet | HTTP 403 (Cloudflare challenge) to scripted requests |
| Testnet indexer history (previous turn), two addresses | worked, stats computed |

Not tested: connecting a browser wallet, switching networks in a wallet, sending any transaction (testnet or mainnet), confirmation tracking from a real send, QR scan, print/download in a browser, mobile layout in a real browser, Netlify deployment of this version.

## 5. History on mainnet

Ordinary RPC cannot list an address's past transactions. The public mainnet explorer API answered HTTP 403 (Cloudflare challenge) to scripted requests, so it is not used by default.

Default on mainnet: Veltrio reads Arc's USDC system Transfer logs for the connected address directly from the RPC over a bounded recent window (12 chunks of 9,000 blocks, about 15 hours at the measured block rate), then loads each transaction. This needs no key. Limits, all shown in the app:
- Recent window only; totals are scoped to it and never called lifetime.
- Reverted transactions emit no logs, so failed transactions from other apps are not listed and the failed count shows as unavailable. Failed sends made in Veltrio on this browser still appear.
- The public RPC rate-limits bursts, so loading can take several seconds and can fail; there is a retry.
- Amounts below 0.000001 USDC display as 0.00.

For full history, set `VITE_HISTORY_API_URL` to a Blockscout-compatible API that supports Arc Mainnet. It must be a public URL: any value in a `VITE_` variable is visible to every visitor. Docs.arc.io lists Alchemy, Blockdaemon, dRPC and QuickNode as RPC providers; whether their indexed-history APIs cover Arc Mainnet was not verified. A provider that needs an API key must be called from a server-side function (for example a Netlify Function holding the key in a private environment variable), not from this frontend.

## 6. Remaining security concerns

1. The Send flow has never been run end to end with a real wallet. Do not enable it on mainnet before doing so on testnet.
2. No independent audit. Review `src/pages/Send.tsx`, `src/veltrio/network.ts` and `src/veltrio/TxWatcher.tsx` first.
3. Wallets may override fee fields; behavior of MetaMask/Rabby with the 20 gwei floor on Arc was not observed.
4. Dependency advisories: `bun audit` reports 35 (14 high, 15 moderate, 6 low). The ones inspected sit in transitive packages (Circle SDKs preinstalled in the workspace, wagmi connector SDKs, browser polyfills) that Veltrio does not call directly, and are mostly denial-of-service class. They were not individually triaged.
5. Public RPC and third-party explorer are trust and availability dependencies. A wrong RPC answer could mis-show balances; the wallet still signs against its own RPC.
6. Saved addresses live only in the browser and can be cleared; the look-alike warning is a heuristic, not a guarantee against address poisoning.
7. Transactions can be dropped by the network; Veltrio explains this after 2 minutes but cannot cancel or replace them.

## 7. API keys and external services

None are required for the default build: no keys, no backend. Optional: a Blockscout-compatible history URL (public) and, if you choose a keyed provider, a server-side function you would write and host. Circle faucet (testnet only) is a public link.

## 8. Netlify

The live site https://veltriofi.netlify.app still serves the earlier TESTNET build. This version has NOT been deployed.

Variables (Site settings, Environment variables). They are applied at build time, so change them and redeploy:

| Variable | Value |
| --- | --- |
| `VITE_VELTRIO_NETWORK` | unset = testnet (default); `mainnet` only when you are ready to build the mainnet site |
| `VITE_ENABLE_MAINNET_SEND` | leave unset (Send off). Only set to `true` after your own testing and review |
| `VITE_HISTORY_API_URL` | optional, public https URL only |

Recommended order:
1. Create a separate Netlify site (or branch deploy) built with `VITE_VELTRIO_NETWORK=testnet`. Fund a wallet from the Circle faucet and test connect, switch network, send, confirmation, receipt, history, saved addresses on desktop and mobile.
2. Push this code to GitHub (use the push option in Arc Studio), connect the repo in Netlify, set build command `bun run build` and publish directory `dist`. If Netlify's build image does not provide Bun, run `bun install && bun run build` locally and upload the `dist` folder instead (drag and drop in the Deploys tab, or `netlify deploy --prod --dir=dist`).
3. With the mainnet build live and Send still off, check balance, receive address, QR and network warnings with a small wallet.
4. Only after independent review, set `VITE_ENABLE_MAINNET_SEND=true`, redeploy, and make a small first transfer yourself.

## 9. Keep disabled until verified

- Mainnet Send (off by default; needs `VITE_ENABLE_MAINNET_SEND=true`).
- Any claim of complete mainnet history or lifetime totals (not available from the default RPC source).
- Failed-transaction statistics on mainnet RPC history (not obtainable from RPC).
