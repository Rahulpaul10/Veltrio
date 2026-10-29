# Veltrio

Veltrio is a non-custodial USDC wallet app for Arc. Connect your own wallet to see your real USDC balance, receive USDC, browse your recent transaction history, open and print receipts, review a plain wallet activity summary, and keep a local address book.

The production build is a **read-only release on Arc Mainnet**: it never signs or sends a transaction, and no setting can turn sending on. Development (`bun run dev`) and `bun run build:testnet` use Arc Testnet with test funds, where sending is available for testing. Details: `docs/mainnet-read-only-release.md`.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Connect MetaMask, Rabby or another browser wallet, with a prompt to switch or add the right network
- Live USDC balance, available vs. reserved-for-pending, and network status
- Send USDC (testnet builds only) with address validation, fee estimate, review step and real confirmation tracking
- Receive page with your address and QR code
- Transaction history with pending, confirmed and failed states. On mainnet it covers a recent window only, and the app says so
- Printable and downloadable receipts
- Wallet activity summary with clearly stated time range
- Saved addresses stored in your browser
- In-app notifications for submitted, confirmed and failed transactions

Veltrio never asks for or stores private keys or seed phrases.

## Tech stack

React 18, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit, TanStack Query, Framer Motion, Sonner.

## Development

Prerequisites: [Bun](https://bun.sh) and a browser wallet.

```bash
bun install
bun run dev              # dev server on port 5173
bun run check            # lint and typecheck
bun run test             # offline unit and transaction-flow checks
bun run test:wallet      # wallet-integration checks with a mock wallet (no funds)
bun run verify:network   # read-only checks against the live Arc RPCs (no transactions)
bun run verify:docs      # confirm network settings against Arc's official docs
bun run build            # production build into dist/ (Arc Mainnet, read-only)
bun run build:testnet    # testnet build into dist-testnet/ (sending enabled, test funds)
bun run verify:release   # checks the built dist/ is mainnet and has no send or signing code
bun run verify:deployed https://YOUR-SITE.netlify.app   # compares a live site with the verified dist/
```

### Environment variables

All are public build-time values (Vite inlines them into the site). Never put a secret in a `VITE_` variable.

| Variable | Purpose |
| --- | --- |
| `VITE_VELTRIO_NETWORK` | `testnet` (default when unset) or `mainnet`. `.env.production` sets `mainnet` for production builds. Do not set it in Netlify |

Testnet funds: get Arc Testnet USDC from the [Circle faucet](https://faucet.circle.com).

## Deploying to Netlify

`public/_redirects` makes deep links such as `/tx/0x...` work and `public/_headers` adds basic security headers. Build command `bun run build` (Arc Mainnet, read-only), publish directory `dist`. Set no environment variables in Netlify. Step-by-step deployment to a new site and post-deploy checks: `docs/netlify-mainnet-deploy.md` (release facts: `docs/mainnet-read-only-release.md`).

## Network settings

Network settings live in `src/veltrio/network.ts` and `src/config.ts`. Chain, USDC and explorer values come from `src/onchain-facts.ts` and are checked at startup against values verified from Arc's documentation, so a mismatch stops the app instead of reaching a transaction.

Manual wallet testing steps for MetaMask and Rabby on Arc Testnet are in `docs/manual-testing.md`.
