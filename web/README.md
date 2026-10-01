# SevenDay frontend

React, TypeScript, Vite and viem. The source is here; the production export is `../dist/`. It is a single page with hash anchors, locally bundled assets, and Vite `base: './'` for static gateways and subpaths. No backend, API key or private credentials are required.

## Install, build and preview

Use Node 22.12+ (validated with Node 24.9.0) and npm:

```sh
cd web
npm ci --cache /tmp/sevenday-npm-cache
npm run typecheck
npm run build
npm run verify
npm run preview
```

`npm run dev` also works: the preparation step in `build` generates development configuration in `public/`. The production manifest is emitted after the final Vite export. Rebuild after any source, ABI or public-asset change; never hand-edit exported assets or their hashes.

## Configuration and provenance

`handoff/deployment.json` and `handoff/network.json` preserve the supplied public handoffs for reproducible builds after assignment inputs are removed. They are build inputs, not a second runtime address map. `scripts/prepare.mjs` reads each ABI from the exact deployed Git commit, compares it byte-for-byte to `docs/abi/<Contract>.json`, verifies canonical Keccak-256 (recursively sorted JSON object keys, arrays in original order), and copies the raw array to the export. The existing Solidity source is unchanged.

The sole runtime address/chain/RPC configuration is **`dist/imd-deployment.json`**, fetched by `src/config.ts`. Each referenced ABI is fetched and hash-verified before rendering the dashboard. The build embeds a digest of the expected configuration (excluding the asset inventory) to reject configuration drift, plus the launch transaction hash and expected pool ID. No alternative address or chain map is bundled. Network and wallet-add-chain objects retain the handoff values unchanged.

The strict task manifest schema prohibits additional top-level keys, including `poolKey`. `src/chain.ts` therefore obtains the complete key from the PoolManager's `Initialize` event in the attested launch receipt, then checks its computed pool ID against the build-time hash of the exact handoff key. This retains the real initialization guard and effective 1.25% fee; it does not use the manifest proposal's 0.30% fee. Only this attested native-ETH pair is supported. A missing/mismatched pool keeps swaps disabled.

`npm run verify` checks the exact manifest contract set, all network fields, allowed schema, asset inventory and SHA-256 hashes, canonical ABI hashes, pinned ABI bytes, and export limits. `imd-deployment.json` excludes itself from its inventory. The runtime file contains no extra metadata keys. `public/imd-deployment.json` is a generated development copy with an empty inventory; the production script replaces it after export.

## Wallets and actions

EIP-6963 browser wallets are discovered, with an injected `window.ethereum` fallback and a wallet selector when several are available. No WalletConnect project ID was supplied, so no WalletConnect connector or unrelated service is included. Wallet signing stays in the visitor's provider. Public reads use the supplied public RPCs, in order, with bounded fallback and batched HTTP requests. Chain IDs, code presence and the vault's token binding are checked before actions; values are read at one block. Reads refresh every 12 seconds while visible, manually, and after receipts. Native ETH and SEVEN use their own decimals. No USD oracle was supplied; the interface states that USD values are unavailable.

- Stake: approve the exact token amount to the vault if necessary; confirm stake separately. Every addition resets the entire position's seven-day lock.
- Unstake: enabled when the RPC block timestamp reaches the on-chain unlock time. Rewards remain claimable separately.
- Claim: available during the principal lock when `earned(wallet)` is positive.
- Fund: explicit donation acknowledgement, exact approval, then the guarded `fundRewards(amount,minDuration)` overload. The default minimum is seven days, with shorter durations chosen explicitly.
- Restart: available only after the prior period ends and queued rewards can fund a new stream.
- Swap: quote through the configured Uniswap v4 quoter using `eth_call`/simulation. Minimum receive applies the selected slippage to the output; the quote expires after 60 seconds and input/account/chain edits invalidate it. ETH buys require no approval. SEVEN sells expose token-to-Permit2 approval, Permit2-to-Universal-Router permission and the swap as separate transactions. Every spender comes from the runtime network block. Router permission and swap deadline last 20 minutes. Quotes must be refreshed after approval steps.

Every transaction has a review dialog and is simulated before asking the wallet to sign. Per-action labels show simulation, signing, confirmation, rejection and failure; other writes stay disabled while one is in flight. Account/chain changes cancel reviews and signing is checked against the current wallet. Receipts, including reverts, determine success and trigger fresh state. Transaction and contract explorer links are available. If confirmation times out, the transaction remains pending with a “Check confirmation” recovery button; do not reload to resubmit a pending transaction. Pending transactions are not persisted across page reloads: inspect wallet history first after a reload.

## Validation

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/sevenday-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/sevenday-browsers npm test
```

The test command owns a temporary foreground HTTP server and browser, serves the actual export at `/preview/`, closes both, and writes delivered evidence under `docs/frontend-evidence/`. It covers realistic wallet/RPC interactions with mocked signing; the final browser check reads the actual public Sepolia RPC without connecting a wallet or broadcasting. It requires network access for that final read. No test-only entrypoint or mock is shipped in the application bundle.

See `../docs/frontend-validation.md` for actual outcomes, repairs and untested behavior, and `../docs/DESIGN.md` for the implemented design. The assignment protects repository-root writes, so the requested design document is delivered under the permitted `docs/` path.

Publishing is a later control-plane step. This worker does not deploy contracts, pin IPFS content, assign a site name, or claim publication checks passed. Absolute social image metadata remains pending until a public domain/gateway is assigned. The favicon, title, description and social text are present now.

Delivery note: the worker checkout has read-only `.git` metadata, so it cannot stage or commit these files in place. All deliverables are present in the permitted paths; validation includes a separate temporary Git packaging snapshot.
