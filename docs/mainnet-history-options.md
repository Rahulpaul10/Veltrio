# Complete Arc Mainnet transaction history: options

Date: 2026-10-29. No provider was integrated. Nothing here is fabricated: every row says what was actually tested and what was only read in documentation.

## The problem

A standard RPC node cannot list an address's past transactions. Veltrio needs, for a connected wallet: successful transfers (sent and received), failed (reverted) transactions, fees and timestamps, over its whole lifetime, or a clearly labelled limited range.

## What works today (tested)

Default mainnet source: Arc's USDC system Transfer logs read from the public RPC (`eth_getLogs`), as Arc's own wallet guide describes. Measured on 2026-10-29:

- The RPC accepted 9,999-block ranges and rejected 10,000 ("requested range too large").
- Bursts of log queries are rate limited. Veltrio therefore scans 12 chunks of 9,000 blocks with two requests each, one at a time with backoff, which covers about 15 hours (the chain produced roughly 10,000 blocks per 5,070 seconds when measured).
- A quiet wallet loaded in about 8 seconds; a very busy address was slow and was capped.
- Reverted transactions emit no logs, so failed transactions from other apps cannot be listed. Failed sends made inside Veltrio are kept locally and shown.

Scanning all history this way is not practical in a browser: at the time of measurement the chain was about 28.5 million blocks, which is about 2,850 range queries per direction for one address, before rate limits.

## Candidate sources

| Source | Evidence level | Findings | Key handling |
| --- | --- | --- | --- |
| Arc public explorer API (`explorer.arc.io/api/v2`) | Tested | HTTP 403 Cloudflare challenge for scripted requests from this environment. Behavior from a real browser page is unknown, and a challenge cannot be solved by a background fetch. The testnet explorer API did work | No key. Not relied on |
| Alchemy Transfers API (`alchemy_getAssetTransfers`) | Documentation only | Docs list Arc Mainnet and Arc Testnet, with host `https://arc-mainnet.g.alchemy.com/v2/{apiKey}`; internal transfers are documented as available on Arc. Arc's own docs list Alchemy under Data indexers (balances, transfers, transaction history). Not tested: no key. Unknown: whether reverted transactions are returned, how native and ERC-20 views of one USDC transfer are reported, rate limits | API key. Treat as secret. Keep it in a server-side function; a key in the frontend is visible to every visitor |
| Thirdweb Insight | Partly tested | Listed in Arc's Data indexers. The endpoint answered "client id is missing" without an `x-client-id` header, so access needs a client ID. Arc chain support was not verified | Client ID is designed for browsers but must be restricted by allowed domains in the provider dashboard |
| Zerion API | Documentation only | Listed in Arc's Data indexers (transactions, balances). Not tested | API key, server-side |
| Envio HyperIndex, Goldsky, The Graph, Pinax | Documentation only | Listed in Arc's Data indexers. These are indexing frameworks: you define and host the index, then query it. Not evaluated | Depends on setup |
| Own indexer | Documented method | Arc's indexing guide: read the system emitter and token logs with `eth_getLogs`, order by block number, no reorg handling needed because of deterministic finality. Needs a backfill, a database and a host | Server-side RPC access; a dedicated RPC provider avoids public rate limits |

## Why none was integrated

The requirement is that history must be real and complete or clearly limited. For the keyed providers, completeness, treatment of failed transactions and duplicate records are unknown until someone tests with a real key. Integrating first would risk showing wrong totals. So the app keeps the labelled limited window.

## Recommended path

1. Pick one provider from Arc's Data indexers page. Alchemy is the best documented for per-wallet transfers on Arc, but that is a documentation read, not a test.
2. Get your own API key. Do not paste it into chat, source files or any `VITE_` variable.
3. Run the harness against a few mainnet addresses that have recent activity:
   `ALCHEMY_API_KEY=<your key> bun run verify:history-provider 0xAddress`
   It compares the provider's answer to the RPC ground truth for the same recent window and reports missing, extra and duplicated transactions. It is written from the docs and has not been run against the real service. A pass means complete for that window only.
4. Separately check, with the provider's own docs or a known reverted transaction, whether failed transactions are returned. If not, failed counts must stay "unavailable" on mainnet.
5. Only if it passes: add a small server-side function (for example a Netlify Function) that holds the key in a private environment variable and forwards a fixed, validated query for the connected address, with caching and rate limiting. The app would then set `VITE_HISTORY_API_URL`-style configuration to that function. That integration has not been built.
6. Keep the labelled limited RPC window as the fallback whenever the provider fails, and never mix its results with provider data without de-duplicating by transaction hash.

## Statistics rules that must hold with any provider

- Count each transaction hash once. A native-USDC and ERC-20 view of the same transfer must not be added twice (Arc emits two logs for one ERC-20 `transfer()`).
- Sent and received totals use only successful, direct USDC transfers; swaps and other contract calls are listed but not totalled.
- Lifetime totals are shown only when the provider confirms the full range was returned; otherwise the scope is stated.

## Provider identification (release-readiness review)

Question: is there a reliable provider to complete mainnet history? Answer: one leading candidate is identified, none is verified, none is integrated.

Evidence gathered from public documentation (not from calls with a key):

| Source | What it says |
| --- | --- |
| Arc docs, Data indexers page | Lists Alchemy, Envio, Goldsky, Pinax, The Graph, Thirdweb Insight and Zerion as data indexers for Arc. Alchemy is described as a REST API for token balances, transfers and transaction history. |
| Alchemy docs, Arc API FAQ | Supports Arc Mainnet at `https://arc-mainnet.g.alchemy.com/v2/{apiKey}`. |
| Alchemy docs, `alchemy_getAssetTransfers` | Transfers API; "internal" category available on Arc Mainnet and Arc Testnet. Categories `external` (native value) and `erc20` map to Arc's native USDC and the USDC ERC-20 view. |

Why Alchemy is the leading candidate: it is listed by Arc as a data partner, documents Arc Mainnet explicitly, and returns per-address history without scanning blocks in the browser.

Why it is still not integrated: nobody has run it with a real key against Arc Mainnet. These questions are open and decide whether it is acceptable:
1. Does native USDC appear as `external`, as `erc20`, or as both for one movement (double counting)?
2. Are reverted transactions available at all? `getAssetTransfers` is documented as a transfers API, so failed transactions probably need another endpoint.
3. Are timestamps returned for Arc (the docs mark `withMetadata` timestamps as available only on some networks)?
4. Rate limits and pricing for the expected traffic.
5. Key handling: a key in browser code is public. It must sit in a server-side function (for example a Netlify Function) with the key in a private environment variable.

How to settle questions 1 to 3 without writing app code: run `ALCHEMY_API_KEY=<your key> bun run verify:history-provider 0xAddress`. The script compares the provider's transfer list with the RPC log scan for the same block window and reports missing, extra and duplicated transfers. It has not been run (no key available in the build environment).

Release rule: do not ship a provider path until that script passes on at least two mainnet addresses with different activity, the double counting and failed-transaction questions are answered in writing, and the key is only used server-side.
