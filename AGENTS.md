# AGENTS.md

Project-specific instructions for AI coding agents (Claude Code, Cursor,
Aider, etc.). Read this before making any non-trivial change.

## What this is

`@flarenetwork/flare-stake-tool` is a CLI for managing assets between
Flare's C-chain (EVM) and P-chain (validator/staking platform). It also
wraps several reward-related C-chain contracts (claim,
set-executors). It is published to npm and consumed via `npx` or a global
install. Hardware-wallet support: Ledger (Flare, Avalanche and Ethereum apps).

## Layout

```
src/run.ts, cli.ts     entry (alias rewrite: exportCP → transaction exportCP, -i → interactive) and the Commander commands
src/cli/               options → TxRequest (requests.ts: FLR → nFLR/wei, durations, percentages), input parsers shared
                       with interactive mode (inputs.ts), shared options and signer/account resolution (options.ts)
src/app/               network and ctx.json (env.ts), pre-flight checks + the pipeline (transactions.ts), send -i (send.ts),
                       info.ts, the ForDefi client (fordefi.ts: request shape and auth header frozen)
src/core/              pipeline.ts (build → sign → attach → submit → confirm, the only implementation), types.ts,
                       builders/ (pchain.ts: flarejs 5.2.0 object-style builders; evm.ts: the frozen rawTx shape),
                       signing/ (signature normalization, credentials incl. the Helicon authority), files.ts (the frozen
                       unsigned/signed JSON formats under ForDefiTxnFiles/), json.ts, submit.ts (issue + wait per chain)
src/signers/           privateKey.ts (--get-hacked), ledger.ts (--ledger over a LedgerDevice; FLARE_FAKE_LEDGER_KEY for
                       tests), file.ts (default + -i <id>: writes the unsigned file and stops)
src/chain/             network.ts (the single network table, node URL / API key overrides), clients.ts (flarejs, ethers,
                       cached Context, Helicon gate), keys.ts, units.ts (NFlr/Wei), contracts.ts, validators.ts
src/ledger/            the USB transport (transport.ts) and signing per app (flare, avalanche, ethereum); path.ts (derivation paths)
src/interactive/       inquirer menu calling app/ directly; every question goes through askInquirer (exit 130 on Ctrl-C)
src/constants/         fixed EIP-1559 fees per C-chain operation (fees.ts), menu labels (screen.ts)
test/unit/             unit tests (pure functions, signers, builders without a node)
test/characterization/ record/replay goldens for every signing path, and the scripted interactive menu (offline)
test/integration/      tests against an externally running localflare
```

## Build / test / lint

```bash
pnpm install
pnpm build              # tsc -p tsconfig.build.json (rootDir=src, outDir=dist)
pnpm test               # mocha unit tests
pnpm test:coverage      # c8 + mocha
pnpm test:integration   # CLI E2E against a running localflare (see below)
pnpm lint:check         # eslint @flarenetwork/eslint-config-flare
pnpm format:check       # prettier @flarenetwork/prettier-config-flare
```

Node 24+ required (enforced via `engines`).

## One pipeline, three signers

Every transaction goes through `core/pipeline.ts`: the request is built once
(`core/builders`), signed by the selected signer, the signature is attached to
every credential the account owns, and the transaction is submitted and
confirmed. Between building and signing, `executeTransaction` calls an optional
`beforeSign` with the details read from the built transaction
(`core/details.ts`: fee, imported amount, nonce, value, gas cost, claimed
amount); interactive mode shows them and stops when the user declines, so the
transaction approved is the one signed. The signer is chosen by flag:

1. **`--get-hacked --env-path <file>`** — `PrivateKeySigner`, signs in process.
2. **`--ledger`** — `LedgerSigner`; Flare app signs the full transaction and
   falls back to hash signing for transaction types it does not know, the
   Avalanche app signs the hash, the Ethereum app is accepted for C-chain EVM
   transactions only.
3. **default + `-i <id>`** — `ExternalFileSigner` writes
   `ForDefiTxnFiles/UnsignedTxns/<id>.unsignedTx.json` and stops; after the
   message hash is signed externally and written to
   `SignedTxns/<id>.signedTx.json`, `send -i <id>` finishes the job.

The file signer builds with `FILE_SIGNER_POLICY` (P-chain fee price pinned to
1000, start time 1, UTXO time locks checked against time 1, explicit `-f`
required) so that several ForDefi signers building independently get the same
hash. Do not let other chain state or the clock leak into a file-path build.
The account's UTXOs are the one inherent exception: builds agree only while the
UTXO set is unchanged. Every flarejs P-chain builder gets the build's
`minIssuanceTime` through `spending(inputs)`; without it flarejs checks time
locks against the local clock. `pChainInputs` leaves dust out of the UTXOs (worth
less than one input's fee at the fee config's `minPrice`), and each builder
passes `inputs.notices` to `bundle()` so the user is told. Values a command leaves out are read
from the chain and pinned by passing them: `--nonce`, `claim -a`, `exportPC -a`,
and `--gas-limit` of `claim`/`withdrawal`, whose default depends on whether the
recipient has contract code.

## Unit conventions (read carefully)

- `-a` (amount) and `-f` (fee) are in **FLR** on every path; `cli/requests.ts`
  converts them with `parseFlr` to **nFLR** (bigint, 9 decimals) for
  P-chain/atomic requests and with `parseFlrToWei` to **wei** (18 decimals)
  for C-chain commands. Extra non-zero decimals and commas are errors, never
  silently dropped. Nothing downstream sees FLR.
- Amounts are typed `NFlr` or `Wei` (`chain/units.ts`): plain bigints at
  runtime, branded so the compiler refuses one where the other is expected.
  Parsing returns the right type; a value read from the chain is marked with
  `asNFlr` / `asWei` where it comes in. Arithmetic gives a plain bigint, so
  mark the result again.
- `-e`, `-s` and `--period` accept unix seconds or durations (`2d12h`);
  `parseEndTime` resolves a duration against now.
- The `--env-path` file uses `PRIVATE_KEY_HEX` (hex) and/or `PRIVATE_KEY_CB58`
  (base58check). `parsePrivateKey` checks the CB58 checksum itself: flarejs'
  `base58check.decode` only drops it.
- Network minimums (P-chain) differ per network — validator self-bond /
  delegation: flare, songbird, costwo = 1,000,000 / 50,000; coston =
  100,000 / 10,000. Verify against the chain rather than this file:
  `platform.getMinStake` on `<api>/ext/bc/P`.
- C-chain balances are in wei (1e18 per FLR), P-chain in nFLR (1e9 per FLR).
  `formatWei` and `formatFlr` (`chain/units.ts`) print them.

## Dependencies: real constraints

Everything not listed here follows Renovate; `pnpm audit --audit-level=high`
runs in CI and must stay clean.

- `@flarenetwork/flarejs` is pinned **exactly** (`5.2.0`). 5.x removed the
  positional pre-Etna `pvm.*` builders; the object-style builders
  (`pvm.newImportTx({...}, context)`, formerly `pvm.e.*`) are the only ones.
  It ships a CommonJS build, but its typings do not resolve under
  `module: node16/nodenext`, so the project stays on `module: CommonJS`.
- CommonJS-only majors, because of the point above: `commander` 14 (15 is
  ESM-only), `inquirer` 8 (9+ is ESM-only), `figlet` 1.11 (1.12 is ESM-only).
  Colours use Node's built-in `util.styleText` (no chalk).
- Ledger: `@zondax/ledger-flare` 1.x and `@avalabs/hw-app-avalanche` 1.x are
  the last lines on the classic `@ledgerhq/hw-transport` API; their 2.x lines
  moved to Ledger's Device Management Kit and need a rewrite of the Ledger
  module. `@ledgerhq/cryptoassets` has a `>=13.33.0` floor in
  `pnpm-workspace.yaml` overrides (security).
- `eslint` stays on 9.x until `@flarenetwork/eslint-config-flare` supports 10.
- `typescript` stays on 5.x; TypeScript 7 (Go compiler) needs
  `typescript-eslint` support first.
- `rootDir: "src"` is set in `tsconfig.build.json` only, not the base
  `tsconfig.json`. The base tsconfig includes both `src` and `test` for
  type-checking; setting `rootDir` there would cause TS6059 "file is not
  under rootDir" errors that cascade into hundreds of `no-unsafe-*` lint
  errors.
- `node-pty` (used by interactive integration tests) ships prebuilt
  native binaries, but pnpm strips the executable bit from the
  `spawn-helper` binary during extraction. The interactive test harness
  re-`chmod +x`s it before the first spawn — keep that workaround.
- Coverage uses `c8` (`.c8rc.json`), not nyc.

## Fork awareness

Etna (dynamic P-chain fees) is active on every Flare network, so the P-chain
builders use the Etna object-style flarejs builders only; there are no
pre-Etna code paths or runtime fork checks left. Helicon (auto-renewed
validators, go-flare v1.15) is the only fork gate: the two auto-renewed
validator commands check `info.upgrades` (`heliconTime`) and refuse to build
when it is missing or in the future (public nodes on 1.14 return no field).

## Integration tests

How to start localflare and run them is in CONTRIBUTING.md ("Integration
tests"). What to keep in mind:

- A committed `.only` fails the run (`forbid-only` in both mocha configs), and
  so does a skipped test (`forbid-pending` in `.mocharc.yml` and
  `.mocharc.integration.yml`): `pnpm test` is the release workflow's only test
  gate. Run one test with `npx mocha --grep "<title>"` instead.
- The signing suites create a fresh account funded from the ewoq key for every
  run (`test/integration/accounts.ts`), so they are rerun-safe and independent
  of the max-three-validators rule, and all end times are relative to now.
- `cli-evm.test.ts` signs `withdrawal` and `customCChainTx` directly, including
  the nonce taken while another transaction of the account waits in the node.
  `claim`, `setClaimExecutors` and `setAllowedClaimRecipients` have no live
  test: localflare has none of Flare's reward contracts, so only the fixture
  recorder runs them, with those contract reads stubbed.
- The ewoq private key
  `56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027` is public
  and funded on localflare's C- and P-chains. **Local test networks only, never
  mainnet.**

## Node URL and API key

What users see is in `docs/COMMANDS.md` (`--rpc-url`, `--api-key`). What the
code must keep:

- `--rpc-url` / `FLARE_RPC_URL` replace the network's base URL and keep its hrp
  and ids. `Clients.verifyNetwork` refuses a node whose `info.getNetworkID` is
  not the network's, before anything else and before the Context is built;
  goldens recorded without that call get it from
  `test/characterization/node-stubs.ts`.
- The key goes as the `x-apikey` header on every request of every client:
  `chain/clients.ts` assembles the flarejs Context itself, because
  `Context.getContextFromURI` builds keyless clients. `FLARE_API_KEY` goes only
  to the node of `FLARE_RPC_URL` or the network's own, never to one that
  `--rpc-url` names.
- A request carrying the key refuses a redirect (flarejs fetch options
  `redirect: "error"`, the ethers connection's `getUrlFunc`): both libraries
  would send the header on to the redirect's target.
- Every client notes its node on the errors it throws (`notingNode`). Print
  errors through `describeError`, which adds the causes and the node and masks
  credentials (`redactSecrets`).
- `interactive` takes the two flags like any command, checks the URL before the
  banner, and refuses the account and network options, which its menu asks for.

## Characterization goldens (offline)

How they are recorded and replayed is in CONTRIBUTING.md ("Characterization
goldens"). The rules:

- `pnpm test` replays every golden; a difference means behaviour changed. An
  intentional change updates the golden (`UPDATE_GOLDENS=<name>,…`) **in the
  same commit** as its CHANGELOG and `docs/COMMANDS.md` entry. Re-record
  (`pnpm test:record-fixtures`) only when a scenario's inputs change, never to
  make a failing golden pass.
- The replay answers every submission with the recorded id whatever bytes are
  sent, so an update that changes the submitted bytes must also change the
  fixture's submission, its id and the receipts or status queries for it: the
  goldens check that each reported id is the id of the bytes sent, and
  `fixtures.test.ts` that each recorded id is the id of its recorded bytes.
- A golden fails when its recording has a call the command no longer makes
  (`RpcReplayServer.unused()`), so removing a check that asks the node fails
  even when the output stays the same; `eth_blockNumber` polls and calls a stub
  answers are exempt. A unit test that needs a call its scenario's command
  doesn't make passes a stub to `withReplay` instead of adding it to the
  recording.
- The printed output includes the warning for an end time that is not in the
  future, which depends on the clock: keep the recorded end times in the past
  so that it always prints.

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
- **Don't reintroduce `genesis.json`**: the integration tests run against an
  externally started localflare (CONTRIBUTING.md, "Integration tests").
- **Don't move `module` to `node20` or add `verbatimModuleSyntax`**, though the
  Flare TypeScript handbook asks for both: flarejs' typings don't resolve under
  `node16`/`nodenext` (see "Dependencies"), and `verbatimModuleSyntax` with
  CommonJS output would need every import rewritten as `import x = require()`.
  Check flarejs again before changing either.
- **Don't add `preserveSymlinks: true` to tsconfig.** It blocks TypeScript from
  resolving transitive types through pnpm's symlinked `node_modules` (types a
  dependency re-exports from its own dependencies), producing hundreds of
  `no-unsafe-*` lint errors in CI.
- **Don't change `FILE_SIGNER_POLICY`** (fee price 1000, start time 1, lock
  check time 1, explicit fee) without a CHANGELOG entry: ForDefi signers building the same
  transaction independently must keep getting the same hash.
- **Don't change the unsigned/signed JSON formats** in `core/files.ts`; they
  are a contract with external signers and old files must keep loading. The
  readers check only the fields the tool reads and return the object as it
  was: requiring another field would refuse older files. Anything that signs or
  sends a file goes through `bundleFromConsistentTxJson`, which refuses a
  `message` or `unsignedTransactionBuffer` that isn't the file's transaction.
  Since 5.0.0 a file records the account it was built for (`signer`: the
  P-chain address in `signatureRequests[0]`, the C-chain address at the top of
  an EVM file); `forDefi sign` and `send` refuse another account
  (`signerMismatch`), and files without it (empty or missing) are not checked.
- **`--derivation-path` and `--ctx-file` have no Commander default**, so that a
  given one can be told apart: `options.derivationPath` / `options.ctxFile` are
  undefined when not given. A given `--ctx-file` must exist; without
  `--derivation-path`, `--ledger` takes a Ledger context's path and key.

## Common gotchas

- "no UTXOs available to import" right after an export → atomic mempool
  propagation lag. The interactive flows poll for the pending UTXO; scripts
  should wait a few seconds between an export and the matching import.
- A stake test skips with "no free node": every localflare node is currently
  validating (the minimum period is 15 minutes, test stakes last 1 hour).
- "Tx already sent to chain" from `send` → `markSentToChain` set
  `isSentToChain` in the signed tx JSON as soon as the node took the
  transaction (`onIssued`), also when the wait for it timed out; it is removed
  only when the chain refused it (`TxNotAcceptedError`). Check the tx id before
  removing the field by hand, or use a new id.
- ForDefi auth requires `private.pem` and `token` files at the cwd; both are
  in `.gitignore`. The ForDefi host is in `src/app/fordefi.ts`.
- `FLARE_FAKE_LEDGER_KEY=<hex>` makes `--ledger` use a software key instead
  of a device (tests only). It is announced on stderr every time and refused on
  flare and songbird, so it only works on costwo, coston and localflare.
- `src/ledger/` talks to the device: `transport.ts` opens and always closes the
  USB transport (`withApp`), `bytes.ts` normalizes signatures (`rsvHex`,
  `evmSignatureHex`), and `index.ts` routes each call to the open app, which
  is asked again with the dashboard APDU before every operation, so the user
  can switch apps in between. The tests cover the signature helpers, the
  Avalanche path split, app detection with an injected answer, the
  return-code check, `LedgerSigner` with a fake device (every app, atomic
  and EVM, blind signing and `confirmLedgerAccount`), and with stand-ins
  `withApp` (a missing node-hid binary, the transport always closed) and the
  Flare app's C-chain signing (its refusals). The USB transport itself and the
  app clients run only against a device, so check changes there on a real one
  (Flare, Avalanche and Ethereum apps). On localflare the Flare app knows neither
  the network nor the chain id and refuses everything: test there with the
  Avalanche app (blind signing) and, for C-chain transactions, the Ethereum app.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), as the
Flare handbook's Commit Messages page sets them out: `<type>: <description>` or
`<type>(<scope>): <description>`, the description a short summary in the
imperative mood ("add", not "added").

| Type | For |
|---|---|
| `feat` | a new feature |
| `fix` | a bug fix |
| `refactor` | restructuring without a change in behaviour |
| `test` | adding or changing tests |
| `docs` | documentation |
| `chore` | maintenance: dependencies, tooling |
| `ci` | the pipelines (`.gitlab-ci.yml`, `.github/workflows/`) |
| `chore(release)` | the commit that prepares a release: the version, and the CHANGELOG date of a final one |

Only `fix`, `feat` and `refactor` change the review scope, `src/` (SECURITY.md).
A `test`, `docs` or `chore` commit that needs a change there, such as a seam
for a test, is a `refactor`. Commits must be signed: GitLab refuses unsigned
ones.

## Release process

See CONTRIBUTING.md. In short: a version tag on `main` publishes to npm from
the GitHub mirror, and the version changes only in a `chore(release)` commit,
which also dates the CHANGELOG section of a final release.
