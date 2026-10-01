# Frontend implementation and validation

## Scope and completion

Implementation and validation are complete for the authorized frontend scope. Committing in the supplied checkout is blocked: its `.git` directory is read-only, and `git add` failed creating `.git/index.lock`. The deliverables remain present in the permitted paths for collection. A separate temporary full-tree Git snapshot is used for bundle-size verification; it does not modify the checkout’s Git metadata. This is worker-run evidence, not independent certification. No contracts were redeployed and no live transaction was broadcast. IPFS pinning, site naming and the control-plane HTTP/RPC publication checks are subsequent publisher work.

Delivered: Vite/React/TypeScript source and npm lockfile in `web/`, a complete static export in root `dist/`, verified implementation-derived ABIs, the runtime deployment manifest, reproducible browser interaction tests, screenshots, design documentation, and retained guidance licenses. The existing Solidity, root build configuration, dependencies in `lib/`, and original ABI exports are unchanged.

Scope resolves two contradictions in the brief:

1. The overriding path budget prohibits a root `DESIGN.md`; the implemented design document is `docs/DESIGN.md`.
2. The mandatory manifest schema says to add no other top-level key, overriding the background suggestion to add `poolKey`. Instead, the app derives the exact key from the attested launch receipt's PoolManager `Initialize` event and checks its pool-ID hash against the handoff. There is no alternate address map. Swaps use the emitted 1.25% fee and real guard, rather than the proposal's 0.30% fee or a zero hook.

Assumptions: one page, English, an intentionally light theme, system fonts, injected/EIP-6963 browser wallets, the supplied native ETH/SEVEN pair, and no external USD price source. No WalletConnect project ID or published domain was supplied. The permitted `web/.gitignore` excludes dependencies and caches, including nested node_modules; no other ignore file was changed.

## Deployment binding and live reads

Pinned deployed source: `087f24eafc834f4aa13f89ba301da8e224c4151c`. `scripts/prepare.mjs` and `scripts/verify.mjs` independently compare exported ABI bytes to the files at that Git commit and recompute canonical Keccak-256.

| Contract | Address | Verified canonical ABI hash |
| --- | --- | --- |
| LaunchToken | `0xc98c785255ef29f690b3b40f71f3d1e313d49d9e` | `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee` |
| StakingVault | `0xc36579e569eebfa5730ee1552e0e3b6e0f481efd` | `412192cd69dd0a0af534aae3023d71f956a9193d47ffc12bdd780f5f62b67521` |

Direct publicnode RPC checks returned chain ID **11155111**, token code of **1784 bytes**, and vault code of **4636 bytes**. The launch transaction receipt returned block **11819565** (converted back to decimal), matching the handoff. Its initialization event computed pool ID `0x2787dcde21d8d679b7c0aeb8e6fa7d55c76c2609c52e46593d7bed982c39dd0d`, matching the handoff-derived binding.

The actual browser export also read Sepolia successfully, verified deployed code, checked `vault.token()`, fetched token metadata and the live vault overview, and verified the pool. At inspection the vault was empty and unfunded: APR, total staked and reward reserve were all zero. This is recorded in `frontend-evidence/live-read.txt` and `live-sepolia-desktop.png`. Mock values in other screenshots are explicitly test fixtures, not advertised live returns.

Runtime config and referenced ABI files are fetched from the same relative directory as the page and their expected bindings are checked before transaction controls are enabled. All RPC and Uniswap addresses come from the copied network block. Wallet chain addition uses the exact supplied `walletAddChain` object after a 4902/unknown-chain switch failure.

## Commands and results

Commands run from the repository root unless shown otherwise:

| Command | Result |
| --- | --- |
| `npm install --cache /tmp/sevenday-npm-cache --no-audit --no-fund` (in `web/`) | Passed; exact direct dependencies and npm lockfile delivered |
| `npm run typecheck --prefix web` | Passed, TypeScript strict mode, no emit |
| `npm run build --prefix web` | Passed after final source changes; includes pinned ABI verification, typecheck, Vite build and final manifest generation |
| `npm run verify --prefix web` | Passed: exact handoff/network, complete asset inventory, ABI hashes and SHA-256 hashes |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/sevenday-browsers npx --prefix web playwright install chromium` | Installed Chromium under `/tmp`, outside the submitted tree |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/sevenday-browsers npm test --prefix web` | Passed; 29 checks, including 14 mocked transactions; detailed final results in `frontend-evidence/interaction-results.json` |

Final export: **7 declared assets**, **530,807 bytes including the manifest**. Each asset is under 8 MiB, the inventory is under 128 entries, and the complete export is far below the HTTP-response budget. The manifest excludes itself. The verifier rejects additional top-level configuration keys, inventory omissions, unsafe asset paths, changed network blocks, stale hashes and ABI drift. Build files use a relative base and the tested entrypoint was `/preview/`, with no server rewrites.

The supplied browser MCP could not launch because its expected Chrome executable was absent. A locally installed Playwright Chromium 141 browser was used instead, with a bounded foreground server created and closed by the test script. The screenshots are real browser output from the production export, not mockups. No repository scratch server, browser installation, npm cache, dependency archive or node_modules is submitted. The complete working tree (existing tracked files plus deliverables, excluding ignored dependencies/inputs) is under 6 MiB before compression. A standalone full-tree Git snapshot bundle is checked against the 8,388,608-byte limit under `/tmp`; that packaging artifact is not duplicated in the submitted directories.

## Interaction coverage

The delivered test decodes real ABI calldata and checks destinations, arguments and native value. Signing and transaction receipts are mocked; no real funds are required.

- Disconnected and missing-wallet states; recoverable wallet rejection.
- Wrong-chain writes disabled; switch failure 4902 followed by exact add-chain parameters and successful switch.
- Positive decimal amounts validated without rounding extra precision; amount error linked to its input.
- Staking exact-amount approval, disabled state through receipt, refreshed allowance and separate staking confirmation.
- Explicit whole-position lock-reset warning; cancel/Escape before signing; custom simulation revert prevents wallet submission.
- Wallet transaction rejection recovery; stake state refresh; locked unstake disabled; claim during lock; unstake at the exact chain-timestamp boundary.
- Donation acknowledgement and approval, then guarded `fundRewards(uint256,uint256)` with minimum 604800 seconds.
- Restart only after the previous period and with enough queued funding.
- Native buy quote and swap: configured quoter/router, attested pool key, `0x10` command, `0x060c0f` actions, quote-derived 0.5% minimum and ETH value, with no approval.
- Token sell: exact token approval to configured Permit2, router permission, then zero-value Universal Router execution. The permission is not requested again while still valid.
- Input edits invalidate a quote; account events refresh the position and clear reviews/quotes.
- Reverted receipt is reported as failure; missing deployed code disables writes and a successful refresh recovers.
- Keyboard-only connect → amount entry → approval → modal confirmation → stake, plus skip link, visible focus, dialog cancellation and reduced motion.
- Responsive and enlarged-text rendering; automated accessibility scan; actual public Sepolia reads at the end of the suite.

The UI uses a synchronous send lock and separate action identity for status labels. Every write verifies current wallet chain/account, refreshes state, simulates, then requests signing. Receipt tracking is guarded against concurrent checks. Replacement transactions that change the original intent do not get labeled as a confirmed original action. Unverified or failed RPC state disables writes rather than substituting invented balances.

## Better Interface consolidated review

The pinned workflow and core principles for all six domains were read before implementation, and the documentation section was read before writing `DESIGN.md`. The source, screenshots and interaction results were then reviewed together.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility — Checked | Native controls/labels, skip link, logical heading outline, amount errors, status region, review dialog, disabled explanations; keyboard focus screenshot, reduced-motion assertion, axe A/AA scan with zero violations in the tested disconnected desktop state | No actual screen-reader session, physical device or full assistive-technology certification; axe does not prove full compliance |
| Layout — Checked | Actual 1440, 768, 390 and 320px screenshots; browser scroll-width assertions; stacked forms and stats; 200% root text-size reflow | Not native 200% browser zoom; no RTL/localized variants are implemented |
| Writing — Checked | Verb-led transaction labels, explicit donation and lock consequences, recoverable wallet/RPC errors, explained unavailable states, variable APR and absent USD context | English only; no specialist legal/product-copy review |
| Typography — Checked | System serif/sans hierarchy, numeric alignment, visible token units, wrapping at narrow widths, 16px minimum mobile inputs | System fallback font choice varies across OS; no physical iOS font/zoom test |
| Colors — Checked | Role tokens, selected/disabled/error states, computed rendered pairs in `rendered-checks.json`; representative ratios 5.75:1–12.67:1; automated color-contrast scan | Representative opaque text pairs measured; not every composite/hover/focus adjacency; no dark theme to test |
| UI details — Checked | Panel/field geometry, selected toggles, pending labels, modal and copy patterns; actual rendered screenshots; 120ms opt-in button transitions, no loading entrance animation | No 10%-speed animation-panel replay; no touch hardware or native wallet extension visual review |

### Findings and repairs

| Severity / source | Finding and user impact | Repair and recheck |
| --- | --- | --- |
| High — `web/src/App.tsx:1241` | A fresh 20-minute Permit2 permission was compared against a new full 20-minute horizon. The sell test reached the approval repeatedly instead of the swap. | Require a sufficient 60-second validity window for the fresh quote and cap the swap deadline to the permission expiration. The full sell approval → permission → swap test passes. |
| Medium — `web/src/App.tsx:258` | A receipt refresh could retain the account captured before a wallet change, risking a display of the prior wallet's position. | Refresh uses the latest account ref; obsolete read results are sequence-guarded. Account-change interaction passes. The precise change-during-RPC race was source-reviewed, not separately stress-tested. |
| Medium — `web/src/App.tsx:406` | A cancelled/replaced transaction could otherwise be presented as success of the original action; confirmation retries could overlap. | Track replacement reason, use neutral replacement feedback, skip the original success callback and guard receipt polling. Standard success/revert/pending tests pass; an actual nonce replacement and a long timeout were not reproduced. |
| Low — `web/src/App.tsx:612` | Initial brand markup included a registration symbol without a supplied basis. | Removed the symbol. Final desktop/mobile screenshots reflect the correction. |

No unresolved primary-flow or reflow defect was observed in the final tested states. The review does not claim that all possible wallet/provider behaviors are covered.

## Git packaging

The supplied checkout cannot stage or commit because `.git` is read-only. A temporary copy of its Git metadata under `/tmp` was used to create the delivery commit without changing that checkout. `/tmp/sevenday-delivery.bundle` contains the frontend commit with the pinned deployed source commit as its prerequisite. `git bundle verify /tmp/sevenday-delivery.bundle` passed against the supplied checkout, and the bundle is under 4 MiB, below the 8 MiB limit. It contains only permitted-path changes and is not duplicated inside the submission tree. Separately, a complete working-tree snapshot bundle was under 4 MiB.

## Evidence and remaining limitations

The `frontend-evidence/` directory includes machine-readable interaction results, rendered contrast/overflow measurements, the axe report, live-read text and PNG screenshots. `desktop-disconnected.png` and `desktop-connected.png` show mocked populated states. `viewport-*.png` show the narrow/intermediate layouts with persistent transaction-error feedback and funding expanded. `keyboard-focus.png` records visible focus and `keyboard-dialog.png` records the modal with Cancel focused; `text-200-percent.png` records text enlargement. `live-sepolia-desktop.png` uses actual public RPC data.

Not performed: funded live stake/unstake/claim/funding/restart transactions, live buy/sell execution, hardware wallet testing, installed extension UI, actual Permit2 signature prompts, actual nonce replacement, receipt-timeout recovery, blockchain reorganization testing, full RPC-provider outage testing, physical mobile devices, native browser zoom or a screen-reader session. Quote/transaction simulations and wallet interactions in the suite use controlled responses. The live browser check was read-only. The current empty vault cannot demonstrate real accruing rewards without funding and staking, which were not authorized as validation transactions.

Pending transactions are not persisted after a page reload; the README advises checking wallet history before resubmitting. RPC outages can prevent reads and transactions, with a visible refresh recovery path. Absolute social-image URLs remain pending a published hostname. ENS resolution is not implemented on this Sepolia interface; checksummed address, copy and explorer access are available. These limits are not concealed by the build or control-plane manifest checks.
