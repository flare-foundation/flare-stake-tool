# AGENTS.md

Project-specific instructions for AI coding agents (Claude Code, Cursor,
Aider, etc.). Read this before making any non-trivial change.

## What this is

`@flarenetwork/flare-stake-tool` is a CLI for managing assets between
Flare's C-chain (EVM) and P-chain (validator/staking platform). It also
wraps several reward-related C-chain contracts (claim,
set-executors). It is published to npm and consumed via `npx` or a global
install. Hardware-wallet support: Ledger and Trezor.

## Layout

```
src/
  cli.ts                    Commander entrypoint, action handlers, option parsing
  run.ts                    Entry script (called by bin/flare-stake-tool)
  transaction.ts            exportCP/importCP/exportPC/importPC/stake/delegate/transfer using a private key
  context.ts                Build a Context (web3, addresses, keys) from options or env
  contracts.ts              FlareContractRegistry lookups and validator/stake info queries
  utils.ts                  Hex/unit conversions, key crypto, file IO for tx JSON
  output.ts                 chalk-colored logging
  flare/
    chain.ts                P-chain queries, fee estimation, EIP-1559 fees
    context.ts              Etna fork activation check
    index.ts                High-level export/import/move flows used by the ledger path
    txs.ts                  Transaction builders (atomic exports/imports, stake, delegate)
    pubk.ts                 Public key + bech32/checksum address utilities
  forDefi/
    transaction.ts          ForDefi sign/fetch flow (custodial signing API)
    evmTx.ts                EVM tx builders for withdrawal/claim/setClaim*
  ledger/                   Ledger device transports and signing per app (avalanche/eth/flare)
  trezor/                   Trezor signing
  interactive/              inquirer-driven menu CLI
  ui/                       MUI components (legacy/experimental — unused at runtime)
  constants/                Network configs, contract addresses, ABIs
test/                       Mocha unit tests (utils, pubk, settings, network configs)
test/integration/           Mocha integration tests against docker-compose local network
docker-compose.yml          5-validator localflare network (go-flare v1.13.0)
local/staker[1-5].{key,crt} Test staking certs for the local validators
```

## Build / test / lint

```bash
pnpm install
pnpm build              # tsc -p tsconfig.build.json (rootDir=src, outDir=dist)
pnpm test               # mocha unit tests
pnpm test:coverage      # nyc + mocha
pnpm test:integration   # docker-compose up -d, run CLI E2E, down -v
pnpm lint:check         # eslint @flarenetwork/eslint-config-flare
pnpm format:check       # prettier @flarenetwork/prettier-config-flare
```

Node 24+ required (enforced via `engines`).

## Three signing paths (do not confuse them)

The same logical operation (e.g., `exportCP`) has **three parallel
implementations**, selected by command-line flag:

1. **`--get-hacked --env-path <file>`** — read private key from env file,
   sign locally, submit immediately. Code path: `cliBuildAndSendTxUsingPrivateKey`
   → `src/transaction.ts`. Calls flarejs `evm.newExportTxFromBaseFee` directly.
2. **`--ledger`** — sign on a Ledger device, submit immediately. Code path:
   `cliBuildAndSendTxUsingLedger` → `src/flare/index.ts` → `src/flare/txs.ts`.
3. **default (no signing flag) + `-i <id>`** — build an unsigned tx file at
   `ForDefiTxnFiles/UnsignedTxns/<id>.unsignedTx.json`. The user signs the
   message hash externally, writes the signature back to a `<id>.signedTx.json`
   file under `ForDefiTxnFiles/SignedTxns/`, then runs `send -i <id>` to submit.
   This is the path ForDefi (custodial signing) uses.

These paths use **different flarejs functions** with subtly different
semantics. Changing one is unlikely to be applicable to the others.

## Unit conventions (read carefully)

- `-a` (amount) and `-f` (fee) are in **FLR**.
- `getOptions()` in `src/cli.ts` (~line 352) **multiplies them by 1e9** before
  passing them to action handlers. Downstream code (`transaction.ts`,
  `flare/txs.ts`, etc.) sees them in **nFLR**.
- The CLI prompt in interactive mode says "in FLR" — this is correct because
  the user input flows through `getOptions()` like any other.
- The `--env-path` file uses `PRIVATE_KEY_HEX` (hex) and/or `PRIVATE_KEY_CB58`
  (base58check).
- Network minimums: validator stake = delegator stake = 10,000 FLR (P-chain).
- C-chain balances are in wei (1e18 per FLR), P-chain in nFLR (1e9 per FLR).
  See `dateToDateTimeLocalString`/`integerToDecimal` for display formatting
  (offset 18 for C-chain, 9 for P-chain).

## Pinned dependencies (don't bump without checking)

- `@flarenetwork/flarejs@4.1.1` — newer versions have breaking changes; this
  is the version known to work with `module: CommonJS`. ESM resolution is
  blocked.
- `chalk@4.1.2` — pinned; chalk 5+ is ESM-only.
- `inquirer@8.0` — newer versions are ESM-only.
- `@ledgerhq/cryptoassets@13.33.0` — pinned via `pnpm.overrides` for security
  reasons.
- `tsconfig.json` has `module: CommonJS` (not Node20) and **no
  `verbatimModuleSyntax`**. ESM migration is deferred until flarejs supports
  Node20 module resolution.
- `rootDir: "src"` is set in `tsconfig.build.json` only, not the base
  `tsconfig.json`. The base tsconfig includes both `src` and `test` for
  type-checking; setting `rootDir` there would cause TS6059 "file is not
  under rootDir" errors that cascade into hundreds of `no-unsafe-*` lint
  errors.
- `node-pty` (used by interactive integration tests) ships prebuilt
  native binaries, but pnpm strips the executable bit from the
  `spawn-helper` binary during extraction. The interactive test harness
  re-`chmod +x`s it before the first spawn — keep that workaround.

## Etna fork awareness

`src/flare/context.ts:isEtnaActive(network)` returns whether the network has
passed Durango+Etna activation. Some tx builders (especially in
`src/flare/txs.ts`) branch on this to choose between pre-Etna and post-Etna
formats. When adding a new transaction type, check whether the format
changed at Etna.

## Local network for integration tests

```bash
docker-compose up -d   # 5 validators, go-flare v1.13.0, built-in localflare genesis
docker-compose down -v # CRITICAL: -v removes volumes; without it, stale UTXO
                       # state between runs causes cryptic "couldn't unmarshal"
                       # parse errors and "no UTXOs available to import" failures.
```

- Network ID: `162`
- Initial validator: `NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg` (matches
  `local/staker1.{key,crt}`)
- Funded test accounts: ewoq private key
  `56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027` is
  publicly known and funded on **both** the C-chain (huge balance) and the
  X-chain. **Safe for local test networks only — never mainnet.**
- v1.13 ships a built-in localflare genesis. The custom `genesis.json` was
  removed; do not reintroduce it (v1.13 rejects custom genesis for reserved
  network IDs like 162).

## Tests as executable specifications

The integration tests in `test/integration/` are the **executable behavioral
spec**. They are the ground truth for what the CLI should do. When a test
fails, the bug is almost always in the code, not the test.

**Do not modify test assertions to make a failing test pass.** If you
believe the assertion is wrong, change the spec (CHANGELOG + COMMANDS.md
update) before changing the test, and explain why in the PR.

The unit tests in `test/` cover pure utility functions (hex conversion, key
crypto, address derivation). When you add a new pure function, add tests for
it — both example-based and property-based where applicable.

## Forbidden / dangerous changes

- **No `pre`/`post` scripts** in `package.json` (security policy from the
  Flare TypeScript handbook).
- **Don't reintroduce `genesis.json`** — see "Local network" above.
- **Don't bump `module` to `Node20`** without first verifying flarejs supports
  ESM module resolution. Last check: it does not.
- **Don't add `preserveSymlinks: true` to tsconfig.** It blocks TypeScript from
  resolving transitive types through pnpm's symlinked `node_modules` (e.g.
  `web3-eth` from `web3`'s exports), producing hundreds of `no-unsafe-*` lint
  errors in CI.
- **Don't change the FLR→nFLR conversion in `getOptions()`** without updating
  every action handler that consumes `params.amount` / `params.fee` — they
  assume nFLR.

## Common gotchas

- "exportCP works once but the second one fails with 'unknown type ID'" →
  stale local network state. Run `docker-compose down -v` before retrying.
- "no UTXOs available to import" right after an export → atomic mempool
  propagation lag. Add a small delay (3s) between exportPC and importPC.
- "tx already sent to chain" from `send` → `addFlagForSentSignedTx` set
  `isSentToChain` in the signed tx JSON; delete the file or use a new id.
- ForDefi auth requires `private.pem` and `token` files at the cwd; both are
  in `.gitignore`. The hardcoded ForDefi URL is in `src/constants/forDefi.ts`.

## Release process

Releases publish to npm via GitLab CI when a semver git tag (e.g. `v4.3.0`)
is pushed. The pipeline:

1. Validates tag format (`v\d+\.\d+\.\d+`)
2. Compares `package.json` `version` against the tag
3. Builds (`pnpm build`)
4. Verifies `dist/run.js` exists (in repo and in `npm pack` tarball)
5. `npm publish` with OIDC trusted publishers (no credentials in repo)

Bump `package.json` version + `CHANGELOG.md` together when releasing.
