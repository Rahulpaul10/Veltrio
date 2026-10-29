# Deploy Veltrio (Arc Mainnet, read-only) to a NEW Netlify site

Nothing has been deployed. These are the steps for you to follow. Your existing testnet site (`veltriofi.netlify.app`) must stay untouched.

## 0. What you are deploying

| Item | Value |
| --- | --- |
| Build | `dist/`, 86 files, built with `bun run build` (production mode reads `.env.production`) |
| Network | Arc Mainnet, chain ID 5042 (0x13B2), RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`, USDC `0x3600000000000000000000000000000000000000` (6 decimals) |
| Mode | Read-only: no Send screen, no signing or transaction code in the app's own files |
| Release fingerprint | `6313b810ddcd3cced8ceaa7d80f918ba393e1c30aa836cf8aa2d57a392a3d60d` (printed by `bun run verify:release`) |
| Zip | `release/veltrio-mainnet-readonly.zip`, sha256 `9b91e099afe2011d1d31a93aa3b5dea9546dd8dcd444d97f48a5f653755efddb`, with `release/SHA256SUMS.txt` listing every file |
| Environment variables needed | none |

What I confirmed before writing this (all offline or read-only; no transaction on any network):
- `dist/` is the verified build: `verify:release` 23 of 23 passed, and a fresh rebuild from the current source produced byte-identical files (86 of 86 hashes).
- The compiled code selects `"mainnet"` and takes chain ID 5042 from the verified table, history mode is the RPC log reader, and the testnet flag is false.
- The app's own files contain no send form, `writeContract`, `sendTransaction`, `eth_sendTransaction`, `personal_sign`, `signTypedData` or `signMessage`.
- Mock-wallet tests on chain 5042 (connect, account and network change, disconnect, rejected request) passed 8 of 8 and one write check was deliberately skipped. They include a real USDC balance read from the mainnet RPC.
- A live, read-only history load for one mainnet address returned real transfers covering about 15 hours in about 8 seconds, labelled as limited.
- Not verified by me: how the pages look and behave in a real browser with a real wallet. The post-deployment checks in section 4 cover that.

## 1. Safety rules

1. Create a NEW site. Never deploy this build to `veltriofi.netlify.app`.
2. If you use the Netlify CLI, always pass `--site <NEW_SITE_ID>`. Do not run `netlify link` in this project, and do not trust an existing `.netlify/state.json`: it could point at the testnet site.
3. Set no environment variables. Add no custom domain until section 4 passes.
4. Never paste a seed phrase, private key or API key anywhere. This app does not ask for one.

## 2. Get the files

Option 1 (simplest): download `release/veltrio-mainnet-readonly.zip` from the Code panel, check its sha256 matches the table above, and unzip it into a folder. The folder must contain `index.html`, `assets/`, `_redirects` and `_headers` directly (not inside another folder).

Option 2 (rebuild yourself, from the exact commit):
```bash
bun install --frozen-lockfile
bun run build
bun run verify:release     # must end with "Release verification passed"
```
Your fingerprint should match section 0. If it differs because your tool versions differ, do not deploy until `verify:release` passes, and run `bun run verify:deployed` after deploying (section 4).

## 3. Deploy

Option A, Netlify Drop (no CLI):
1. Sign in at https://app.netlify.com/drop.
2. Drag the unzipped folder (or the zip) onto the page. Netlify creates a new site with a random name.
3. Open Site configuration, then Change site name, and choose a new name such as `veltrio-mainnet`.

Option B, Netlify CLI:
```bash
npm install -g netlify-cli
netlify login
netlify sites:create --name veltrio-mainnet      # note the Site ID it prints
netlify deploy --dir=dist --site <NEW_SITE_ID>   # draft deploy with a unique URL
# run the section 4 checks on the draft URL, then publish:
netlify deploy --dir=dist --site <NEW_SITE_ID> --prod
```
Use a different name if `veltrio-mainnet` is taken.

Option C (Git-connected site) is not recommended for this first release: it makes Netlify run the build with its own tool versions. If you choose it anyway, use build command `bun run build`, publish directory `dist`, and no environment variables.

Then, in the new site: Site configuration, Access control. If visitors see a login or password page, set the site to public. (An earlier site of yours had that setting turned on by default.)

## 4. Post-deployment checks

Replace `SITE` with your new URL. Stop and unpublish on the first failure.

Automated (needs this project on your machine, after `bun run build`):
```bash
bun run verify:deployed https://SITE.netlify.app
```
Expected: every line PASS, ending "Deployed site matches the verified Arc Mainnet read-only build". It compares every file the site serves with the verified `dist/` byte for byte, checks deep links and the security headers. If Netlify changed a file (for example by injecting a snippet) it reports which check failed.

Manual, in a browser with MetaMask or Rabby:

| # | Check | Expected result |
| --- | --- | --- |
| 1 | Open the site | Header badge says "Arc Mainnet" with a block number that keeps increasing. A "real funds, read-only" card is visible on desktop. No testnet wording or faucet link. |
| 2 | Look for Send | No Send item in navigation, no Send button on the dashboard or on saved addresses. Open `/send`: it shows "Send is not available in this read-only release" and no form. |
| 3 | Connect Wallet | The wallet asks only to connect, never for a transaction or signature. Your address appears, copy works, Disconnect works. Rejecting the request shows a calm message and stays disconnected. |
| 4 | Wrong network | Switch the wallet to another network: a banner says Veltrio is set to Arc Mainnet only. "Switch" asks the wallet to switch or add the network. In the wallet popup the details must read chain ID 5042, RPC `https://rpc.mainnet.arc.io`, symbol USDC, explorer `https://explorer.arc.io`. Approving this changes wallet settings only; it is not a transaction. |
| 5 | Balance | The dashboard USDC balance equals your wallet's USDC balance and the explorer's address page (allow a few seconds). A zero balance shows `0.00`, not a placeholder. Going offline in DevTools shows an error state, not a number. |
| 6 | History limits | Transactions and Activity show a "Limited history" notice with the start time of the window (about the last 15 hours). Dashboard totals say they are not lifetime. The failed-transactions figure shows as unavailable. An empty list says it does not mean the wallet has no history. "View on Arc Explorer" opens your address. A transfer from the last few hours appears with the correct hash and amount; an older one is correctly absent. |
| 7 | Receipt | Open a transaction from the list, or `/tx/<any mainnet tx hash>`. Status, fee label (confirmed or estimated) and addresses match the explorer. Print preview works. |
| 8 | Receive | The address and the QR code match your wallet (scan the QR). The network warning is visible. |
| 9 | No writes | In DevTools, Network tab, filter by `rpc`: only read methods appear (`eth_call`, `eth_getLogs`, `eth_blockNumber`, `eth_getBalance`, receipts). There must be no `eth_sendTransaction`, `eth_sendRawTransaction`, `personal_sign` or `eth_signTypedData`, and the wallet never shows an approval for a transaction or signature. |
| 10 | Testnet site | Open `veltriofi.netlify.app`: still the testnet build, still working. |
| 11 | Headers | `curl -sI https://SITE.netlify.app` shows `x-content-type-options: nosniff` and a referrer policy. |

Public RPC rate limits can make history slow or show an error with a retry button. That is expected behaviour; retry once before treating it as a failure.

## 5. Rollback

Netlify, your new site, Deploys: open a previous deploy and choose Publish deploy, or delete the new site. The testnet site is never involved. For an emergency stop, Site configuration, Danger zone, delete the site.

## 6. Remaining blockers and limits

1. No real-wallet evidence for this build yet. Section 4, rows 3 to 9, is that evidence; please keep screenshots.
2. Mainnet history is only a recent window and cannot show failed transactions from other apps. This is disclosed in the app. A complete-history provider is not verified and none is integrated (`docs/mainnet-history-options.md`).
3. Six dependency advisories remain (1 high). None is in the browser files you deploy (`docs/safety-review.md`).
4. No independent security review. Mainnet sending is not part of this release and cannot be turned on by any setting.
