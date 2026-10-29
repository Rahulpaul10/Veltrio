# Manual wallet testing on Arc Testnet (MetaMask and Rabby)

Purpose: produce real evidence for the flows that automated tests cannot cover. Nothing in this file has been performed by Arc Studio. Record your results in the evidence table at the end; until that table is filled in, these flows are "not verified".

## Safety rules

- Testnet only. Before every step, check the wallet shows chain ID 5042002. Never run this with a wallet that holds mainnet funds you care about: create a fresh test account in the wallet.
- Never type a seed phrase or private key into Veltrio or anywhere else. Veltrio never asks for one. If anything asks, stop.
- Do not build or open a mainnet version for this test. The default build is testnet.

## Setup

1. Install the extension (MetaMask, then repeat everything in Rabby). Create a fresh test account.
2. Open the app on the testnet build: run `bun run dev` (default network is testnet) or deploy a testnet build. The live site https://veltriofi.netlify.app is an older testnet build and does not contain the latest fixes.
3. Get test funds: open the Circle faucet at https://faucet.circle.com, choose Arc Testnet, and request USDC for your test account's address. Create a second test account to use as a recipient.
4. Keep the explorer open: https://explorer.testnet.arc.io

## Test cases

For each, write the result in the evidence table.

**A. Connect and disconnect**
1. Click Connect Wallet and choose the wallet. Reject the prompt. Expected: app stays disconnected, no crash.
2. Connect again and approve. Expected: your address appears in the header; menu shows copy, explorer, disconnect.
3. Disconnect from the menu. Expected: connect prompt returns.

**B. Wrong network and add network**
1. With the app connected, switch the wallet to another network (for example Ethereum Sepolia). Expected: a yellow banner says the wallet is on the wrong network; Send cannot proceed.
2. Click "Switch to Arc Testnet" in the banner. Reject it once (expected: calm message), then approve. Expected: banner disappears.
3. Remove Arc Testnet from the wallet's network list, reload, connect, and use the banner. Expected: the wallet offers to add Arc Testnet with chain ID 5042002, RPC https://rpc.testnet.arc.io, currency USDC. Verify those values in the prompt before approving.

**C. Account change**
Switch to your second account inside the wallet (and allow it for the site if asked). Expected: the app shows the new address and its balance without a reload.

**D. Balance**
Compare the Dashboard balance with the wallet's USDC balance. Expected: they match to the cent. Note that the app shows one USDC balance, never two.

**E. Send, success**
1. Open Send. Paste the second account's address. Enter 0.5 USDC. Expected: a fee estimate appears.
2. Click Review. Expected: full recipient address, amount, "Estimated network fee (maximum)", chain and total.
3. Click Send USDC. In the wallet prompt, check: network Arc Testnet, amount 0.5 USDC (6 decimals), and the max fee per gas. Expected: not below 20 gwei. Write down the fee shown by the wallet.
4. Approve. Expected: a "Transaction submitted" toast and a "Waiting for confirmation" screen (not "success"), then "Transfer confirmed" and a confirmed toast.
5. Open the receipt. Expected: status Confirmed, "Network fee (confirmed)", block and time. Compare the fee with the review screen (the review value is an upper bound, so the confirmed fee should be at or below it) and with the explorer.
6. Open the same hash on the explorer. Expected: success, matching amount and addresses.

**F. Rejection**
Repeat E up to the wallet prompt, then click Reject. Expected: message "You rejected the request in your wallet. Nothing was sent.", no transaction on the explorer, form still usable.

**G. Insufficient funds**
Try to send more than your balance. Expected: blocked with a clear message. Then enter your whole balance. Expected: warning that nothing is left for the fee, with a suggested maximum.

**H. Failed transaction (optional, advanced)**
The app only submits transfers that simulate successfully, so failures need an outside nudge. In the wallet's advanced gas controls, set a gas limit that is too low (for example 21000) on a Send, if your wallet allows it. Expected: the transaction is included but reverts; Veltrio shows "Transaction failed", states that no USDC moved and the fee was still charged, and the receipt shows Failed with a confirmed fee. Wallets may refuse or warn; record what happened either way.

**I. Dropped transaction (optional, advanced)**
In the wallet's advanced gas controls, set max fee per gas below 20 gwei on a Send. Arc silently drops these. Expected: Veltrio stays on "Waiting for confirmation"; after two minutes it shows the warning that the transaction may have been dropped, with an explorer link and a "Stop tracking" button. It must not claim failure or success. After "Stop tracking", the status says tracking stopped and the outcome is unknown.

**J. Everything else**
- Receive: scan the QR code with a phone; it must show your exact address. Use Copy and confirm the toast.
- Receipt: Print / Save PDF and Download. Check nothing private beyond public transaction data appears.
- Saved addresses: add, rename, copy, delete; pick one on Send and confirm that picking never sends anything.
- History: the new transfer appears; filters work; refresh works.
- Mobile: repeat A, E and the bottom navigation in the wallet's in-app browser or a phone browser.

## Evidence table (fill in)

| Case | MetaMask result | Rabby result | Tx hash or screenshot | Date and tester |
| --- | --- | --- | --- | --- |
| A Connect / reject / disconnect | | | | |
| B Wrong network, switch, add network | | | | |
| C Account change | | | | |
| D Balance matches | | | | |
| E Send success, fee, confirmation, receipt | | | | |
| F Signature rejected | | | | |
| G Insufficient funds | | | | |
| H Failed transaction | | | | |
| I Dropped transaction notice | | | | |
| J QR, copy, print, saved addresses, history, mobile | | | | |

When you share transaction hashes, Arc Studio can check them against the chain (status, amount, fee). Screenshots can be read but only the hashes can be independently verified.
