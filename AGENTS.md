# Veltrio

Non-custodial USDC wallet app for Arc. Built with Arc Studio. Production build (`bun run build`, via `.env.production`) = Arc Mainnet READ-ONLY release: SEND_ENABLED is false on mainnet with no flag to change it, and the send flow is compiled out. Dev default and `bun run build:testnet` = Arc Testnet with Send on. Mainnet sending would need a new release (see docs/safety-review.md).

## Tech Stack

- React 18, Vite, TypeScript, Tailwind, wagmi v2, viem, ConnectKit (injected connector only), qrcode.react
- USDC: ERC-20 view (6 decimals) at 0x3600…0000 on both networks (verified in docs.arc.io and live RPC). Gas is the same USDC (18-decimal native view). One balance, from `balanceOf`.
- No smart contracts. Sends call `transfer` on the USDC contract, with maxFeePerGas clamped to >= 20 gwei (Arc drops lower).

## Key Files

- `src/veltrio/network.ts` network selection, verified-values self-check, send gate, history source
- `src/veltrio/history.ts` Blockscout history + stats. `rpcHistory.ts` RPC-only history (mainnet default; bounded window, no failed txs)
- `src/veltrio/txStore.ts`, `TxWatcher.tsx` local tracking, receipt watching, toasts. `components/StalePending.tsx` for dropped txs
- `src/veltrio/receiptData.ts` receipt data from RPC
- `src/veltrio/contacts.ts` address book (localStorage `veltrio:contacts:v1`)
- `scripts/test-units.ts` and `scripts/test-flows.ts` offline tests (`bun run test`), `scripts/test-wallet.ts` mock-wallet checks, `scripts/verify-network.ts` read-only live checks
- `scripts/test-security.ts` static security checks (single broadcast site, Send gate, env/secrets), `scripts/verify-docs.ts` config vs live Arc docs
- `docs/manual-testing.md` MetaMask/Rabby testnet steps, `docs/mainnet-history-options.md` history provider research
- `docs/mainnet-read-only-release.md` exact config, limitations, deploy steps; `scripts/verify-release.ts` checks dist/
- `docs/netlify-mainnet-deploy.md` new-site deploy steps + post-deploy checks; `scripts/check-deployed.ts` compares a live site to dist/. Never deploy the mainnet build to the existing testnet site (veltriofi.netlify.app); never auto-deploy it.
- `docs/safety-review.md` verified items, untested items and the mainnet go/no-go checklist
- `public/_redirects`, `public/_headers` Netlify config
- `docs/mainnet-migration-report.md` migration findings and open items

## Dependencies

`package.json` overrides pin patched `undici`, `@grpc/grpc-js`, `toml` and `uuid` (transitive, not in the browser bundle). Remaining advisories are listed in docs/safety-review.md. Re-run `bun run check`, `bun run test`, `bun run test:wallet` and `bun run build` after any dependency change.

## Rules

- Never store keys or seed phrases. Never invent balances, prices or history.
- Verify wallet chain before every send; re-check balance and simulate right before the wallet prompt.
- Confirmed only from a real receipt. Fee labels: "estimated maximum" vs "confirmed".
- Do not add any way to sign or send on mainnet, deploy a mainnet build, or submit mainnet transactions on the user's behalf. Do not add provider URLs or keys to the browser build.
- The mainnet explorer API (explorer.arc.io/api/v2) returned HTTP 403 (Cloudflare) to scripted requests on 2026-10-29; do not rely on it without re-verifying.

## Deployed Contracts

None.
