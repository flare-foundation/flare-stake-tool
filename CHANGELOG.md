# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [[v5.0.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v5.0.0)] - 2026-10-29

### Changed

* **One transaction pipeline for every signing path.** Each transaction type is now built once (`src/core/builders`), signed by one of three interchangeable signers (private key, Ledger, external signature file), and submitted and confirmed by one piece of code, instead of three parallel implementations that had drifted apart. The unsigned/signed transaction file formats, the ForDefi request and every command and flag are unchanged. Behaviour that differed between the paths has been unified:
  * `-f`/`--fee` for `exportCP` and `importPC` is the total fee in FLR on every path. The private key path previously compared it with the per-gas base fee (in a different unit), so the value given was effectively always replaced by a chain estimate; it now pays exactly the fee given, and estimates the fee only when `-f` is omitted. The estimate covers twice the current base fee: since Granite the C-chain base fee can at most double in about a minute (ACP-176), so the transaction still clears after a slow Ledger approval, and an atomic transaction burns its whole fee, so the headroom costs about 0.0056 FLR at the 500 gwei floor. The unsigned-file path still requires `-f` so that every signer builds the same transaction.
  * `exportCP` exports exactly the amount given on every path. The Ledger path used to add the P-chain base fee to the exported amount; the P-chain import fee is now paid from the imported funds on every path, as it already was for the other two.
  * `exportPC -a` is optional on every path, as the documentation already said: without it the whole spendable P-chain balance is exported minus the exact fee of that transaction, with nothing left behind. The previous default subtracted the static base fee (0.001 FLR), below the dynamic P-chain fee of an export (0.002 FLR and up, more with more UTXOs), so it always failed with insufficient funds; the interactive P→C move offers the same corrected amount as its default.
  * P-chain and import UTXOs are read past the node's page of 1024, so accounts with more UTXOs see their whole balance.
  * The checks that an account stakes to at most three distinct nodes and that a delegation targets a current validator, within its validation period, run on every path, including the unsigned-file path. The three-node check counts the new stake's period from now: since the Durango upgrade the network starts a stake or delegation when it accepts the transaction and does not use its start time, so a later `--start-time` used to hide stakes ending before it. `stake` and `delegate` warn on stderr that `--start-time` does not delay the stake; the value still goes into the transaction, so ForDefi co-signers must pass the same one.
  * `forDefi sign` reports the ForDefi transaction id as such, with the `-i` id (it printed the ForDefi id as a "hash").
  * Every path prints the transaction id (on stderr, so stdout keeps only results) as soon as the node takes the transaction, then waits for it to be accepted; an error after that point, such as a failed status lookup or `send` failing to mark the file, names the transaction. The Ledger path printed nothing; the private key and file paths returned before the transaction was accepted.
  * `send -i` accepts signatures with `v` as `00`/`01` or `1b`/`1c` (both were documented, only the first worked), checks that the signature belongs to the configured account before submitting, and fills the authority credential of Helicon configuration transactions.
  * `--delegation-fee` is converted exactly (`0.07` % is 700 shares; floating point used to give `700.0000000000001`), and `--nonce` is stored as a number in unsigned EVM files (the transaction hash is unchanged).
  * `claim`, `withdrawal`, `setClaimExecutors`, `setAllowedClaimRecipients` and `customCChainTx` can be signed with `--get-hacked` or `--ledger` as well as through the unsigned-file flow, and use the C-chain's chain id on every network. `claim`, `setClaimExecutors` and `setAllowedClaimRecipients` used the P-chain network id, which differs from the chain id on Songbird (5 vs 19) and Coston (7 vs 16).
  * The Ledger Ethereum app is used for C-chain transactions only. For P-chain and atomic transactions it signed an EIP-191 personal message over the hash, which the node never accepts; the tool now says so and asks for the Flare app.
  * Ledger: the open app is detected with one device request instead of up to three, the USB transport is closed also when connecting to the app fails, a signature with an impossible `v` is refused instead of turned into a malformed one, and the Avalanche app works with derivation paths whose last indices have more than one digit (`m/44'/60'/0'/0/10` was split at fixed offsets). The software key behind `FLARE_FAKE_LEDGER_KEY` (tests only) is announced on stderr and refused on Flare and Songbird.
  * `init-ctx` honours `--derivation-path`, stores the P-chain address in `flareAddress` (it stored the C-chain address), and accepts `--vault-id` so a ForDefi context no longer has to be edited by hand.
  * Addresses are validated with a strict EIP-55 checksum (a mixed-case address with a wrong checksum is rejected rather than corrected).
  * P-chain addresses (`--transfer-address`, `--owner-address` and the interactive transfer destination) must be P-chain addresses of the selected network. Only their address bytes were used, so `P-costwo1…` or `C-flare1…` given on Flare paid the same key on Flare; they are now refused before anything is built, and the interactive prompt asks again.
  * C-chain transactions signed with `--get-hacked` or `--ledger` without `--nonce` take the next nonce after the account's transactions still waiting in the node (`pending`). They took the next accepted one, so a transaction sent while another was waiting reused its nonce: it was refused, or it replaced the waiting one if it paid more. Unsigned files keep the accepted nonce, which is the same on every node so that ForDefi co-signers build the same transaction, and so does `exportCP`, whose nonce the C-chain checks against the accepted state.
  * `setClaimExecutors` needs `--executors` and `setAllowedClaimRecipients` needs `--recipients`. Without the option they built a transaction that cleared the stored list, and signed and sent it with `--get-hacked` or `--ledger`; clearing a list now takes an explicit empty string, such as `--executors ""`.
  * Amounts (`-a`, `-f`, `--delegation-fee` and the interactive prompts) no longer accept commas. They used to be dropped as thousands separators, so `1,5` meant as 1.5 became 15, and `1,500` is ambiguous between 1.5 and 1500 even in groups of three. A comma is now refused with an error; write `1.5` or `10000`.
  * Amounts with more decimals than the chain holds are refused instead of silently cut off: P-chain and atomic amounts and fees take 9 decimals (`0.0000000001` used to become 0), and the C-chain amounts of `withdrawal` and `claim` now take the C-chain's full 18 decimals (they were cut to 9 as well; amounts with up to 9 decimals give the same transaction as before).
  * Errors exit with code 1 everywhere: `init-ctx` with an invalid public key and `info` with an unknown type printed the error and exited 0. `--nonce` must be a non-negative integer (`-1` was accepted, `abc` failed with a raw BigInt error). An end time that is not in the future, such as `-e 1209600` meant as 14 days (a plain integer is a unix time), is warned about on stderr.
  * The banner is printed only in interactive mode, so command output is plain text, and `--version` is available.
  * The interactive menu calls the same functions as the command line instead of re-parsing generated command lines, and gained entries for auto-renewed validators. Changing the period has no default value there, and a period of 0 (stop auto-renewal) asks for confirmation, showing when the current cycle ends.
  * `send -i` marks the signed file as sent (`isSentToChain`) as soon as the node takes the transaction instead of after it was confirmed, so a wait that times out can no longer lead to a second submission on rerun. The mark is removed when the chain refuses the transaction (P-chain `Aborted` or `Dropped`, C-chain `Dropped`), which may then be sent again; `Aborted` now ends the wait at once instead of after the 90 s timeout.
  * ForDefi errors carry the HTTP status and the answer: an expired token used to surface as "public_key_compressed not found" and a server error as "Transaction is not signed yet?". A transaction that is not signed yet names ForDefi's state.
  * In interactive mode an action that fails no longer ends the session: the error is printed and the menu is shown again. Connecting a wallet retries after an error as well.
  * Interactive mode refuses to start without a terminal (stdin redirected or piped) with an error and exit code 1; it used to show the first question and crash with a stack trace.
  * The interactive C-chain export and import fee no longer defaults to 1 FLR (about 170 times the real cost at a 500 gwei base fee; the menu paid it exactly, while the old private key path paid the estimate). The prompt now offers the fee the transaction would pay if built now (twice the current base fee, as without `-f`), so Enter pays a fee that was shown; a fee typed in instead is paid exactly, after a warning and a confirmation when it is below what the transaction costs at the current base fee (the node would reject it unless the base fee drops); when none can be estimated (nothing to import yet) an empty answer is estimated when the transaction is built, as on the command line without `-f`. The unsigned-file (ForDefi) path still requires `-f`. Invalid amounts, fees, periods and BLS keys are refused at the prompt, which asks again.
  * Every P-chain and atomic transaction prints the fee it burns, read from the transaction itself: `Fee paid: …` once sent, and `Fee: …` for an unsigned file, so ForDefi signers see it before signing.
  * Connecting a Ledger in interactive mode no longer deletes an existing `ctx.json`: a non-Ledger context (such as a ForDefi one with its vault id) is replaced only after confirmation, and the replaced file is kept as `ctx.json.<time>.bak`.
  * The BLS public key and proof-of-possession signature (`--pop-bls-public-key`, `--pop-bls-signature` and the interactive prompts) must be 48 and 96 bytes of hex; the interactive menu used to drop invalid hex silently.
* C-chain gas limits are sized close to the gas each call uses, because since the Helicon upgrade (go-flare v1.15.1, ACP-194) the C-chain charges every transaction for at least half of its gas limit, whatever it uses; 4.4.0 sized them on the premise that unused gas is never charged. To an ordinary account, `withdrawal` is 100,000 (was 500,000: a transfer uses 21,000 but would have paid for 250,000) and `claim` 200,000 (was 600,000; a claim uses about 78,000). A recipient with contract code (a smart contract wallet, or a Personal Delegation Account, which wraps what it receives and takes about 350,000 for a claim) keeps the 4.4.0 limits of 500,000 and 600,000; the tool asks the node whether the recipient has code. `claim --wrap` keeps 600,000 (it uses about 263,000, at most 397,738 on mainnet), and `customCChainTx` is 300,000 (was 1,000,000), so a heavier custom call needs `--gas-limit`. `setClaimExecutors` and `setAllowedClaimRecipients` keep their 1,000,000 floor, so they are charged at least 500,000; they are rare setup calls and the floor guarantees that a stored list can be cleared. `--gas-limit` (which every ForDefi signer of a transaction must pass alike) replaces any default, and `interactive` now accepts `--gas-limit`, `--max-fee-per-gas` and `--priority-fee-per-gas` as well. Signed files built by earlier versions keep the gas limit they were signed with and are charged accordingly after Helicon; rebuild and re-sign them for the lower limits.
* Upgraded `@flarenetwork/flarejs` from 4.1.1 to 5.2.0 (pinned exactly). The P-chain transaction builders now use the Etna object-style API only; the pre-Etna builders were removed from the library and the corresponding dead branches (and the per-transaction `info.upgrades` call that selected them) from the tool. Etna has been active on all Flare networks since 2025, so built transactions are byte-identical, which the new characterization goldens verify.
* The interactive menu no longer asks for a start time when staking or delegating; since the Durango upgrade the chain sets it.
* Dependencies brought up to date: Ledger packages (`@ledgerhq/hw-app-eth` 7, `@ledgerhq/hw-transport-node-hid` 6.33, `@avalabs/hw-app-avalanche` 1.1, the last line on the classic transport API), `commander` 14, `dotenv` 18, `ethers` 6.17, `inquirer` 8.2, and the whole development toolchain (ESLint 9.39, typescript-eslint 8.72, mocha 12, tsx, prettier, chai, fast-check). `chalk` and `clear` were replaced by Node's built-in `util.styleText` and an escape sequence; `nyc` by `c8`. Remaining transitive advisories are closed by bounded `pnpm-workspace.yaml` overrides, `pnpm audit --audit-level=high` runs in CI, and `pnpm audit` is down from 122 findings (2 critical, 61 high) to 5 (none above moderate).

### Removed

* `info network` (it printed only a header) and the undocumented `info mirror` (it only listed the address's P-chain stakes), together with the interactive menu entries for them.
* Dead code that no command reached: the React/MUI UI module, the Trezor module, the EVM transaction helpers in the Ledger signing module, unused Ledger helpers, the `local` network alias and browser-only utilities; and the dependencies they pulled in (`@emotion/*`, `@mui/*`, `@metamask/detect-provider`, `@ledgerhq/hw-transport-webhid`, `@trezor/connect-web`, `@ethereumjs/{tx,common,rlp}`, `buffer`, `node-fetch`, the unused ethers v5 alias). This removes both critical and most high-severity advisories reported by `pnpm audit`.
* The no-op `--blind` and `--threshold` options are still accepted for compatibility but do nothing (they never did).
* Runtime dependencies the rewrite no longer uses: `web3`, `web3-utils`, `bn.js`, `ethereumjs-util`, `bech32` and `@scure/base` (90 packages fewer to install), with the `zod` and `pbkdf2` overrides that only served them; `elliptic` is now a development dependency (tests only).

### Added

* Auto-renewed validators (Helicon upgrade, ACP-236): `transaction addAutoRenewedValidator` registers a validator without an end time that is renewed every `--period`, and `transaction setAutoRenewedValidatorConfig` changes the period or stops the renewal (`--period 0`). Both work on every signing path; the configuration transaction's validator-authority credential is signed by the same key, also when the signature comes from an unsigned-file flow. `info validators` summarises the cycle end, next period and authority of auto-renewed validators. The commands refuse to run on networks where Helicon is not active.
* `--end-time`, `--start-time` and `--period` accept human-readable durations such as `2d12h` or `90m` (units w, d, h, m, s) as well as unix seconds or plain seconds; an end time given as a duration is added to now, and the resolved absolute value is printed. On the unsigned-file path every co-signer must pass that absolute value.
* `--rpc-url <url>` (or `FLARE_RPC_URL`) points any network name at a different node, and `--api-key <key>` (or `FLARE_API_KEY`) sends an API key as the `x-apikey` header with every request, for staging deployments and private nodes behind Flare's API gateway; a copied endpoint URL with `?x-apikey=` works as the URL (an invalid one is reported with the key masked). The network name keeps deciding the hrp and chain ids, and every command that talks to the node first checks that the node's network ID belongs to that name, so a stray `FLARE_RPC_URL` cannot act on another network under the selected network's label. A gateway refusal (HTTP 401/403 or an HTML error page) is reported with a hint about the key instead of a raw dump.
* Offline characterization tests: `pnpm test` replays 44 recorded scenarios (every transaction type on the private key, Ledger and unsigned-file paths, plus the C-chain commands and `send`) against JSON-RPC fixtures and checks the produced bytes, hashes and submitted transactions; `pnpm test:record-fixtures` re-records them against a running localflare.
* Integration tests now target an externally running Helicon-capable localflare (`LOCALFLARE_RPC_URL`, default `http://localhost:9650`) instead of starting docker-compose, use a fresh funded account per run and relative end times, so they can be rerun at any time.

## [[v4.4.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.4.0)] - 2026-09-01

### Removed

* The `optOut` command, along with the airdrop opt-out transaction builder and the `DistributionToDelegators` ABI. The airdrop distribution ran 36 monthly periods from 2023-02-15 and the last one ended 2026-01-30, so opting out no longer has any effect. `DistributionToDelegators` is not even registered on Songbird or Coston, where the command already failed.

### Changed

* C-chain transactions are now EIP-1559 (type 2). `maxFeePerGas` is a ceiling rather than a price: a transaction pays `baseFee + maxPriorityFeePerGas` at inclusion and the unused part of the ceiling is never charged. This lets the tool carry enough headroom to survive a base fee spike without paying for that headroom on every call, which a legacy gas price cannot do. `maxPriorityFeePerGas` defaults to 200 gwei.
* The fee ceiling is 8000 gwei for `claim`, `withdrawal`, and custom C-chain transactions, and 4000 gwei for `setClaimExecutors` and `setAllowedClaimRecipients`. The ceiling is never charged, but the sender has to hold `maxFeePerGas * gasLimit` for the transaction to run, so it is reserved wherever a transaction may have to land during a fee spike and trimmed only for the two commands that rewrite a stored list and can simply be rerun. 4000 gwei is still eight times the 500 gwei base fee floor.
* Gas limits are now set per operation rather than shared: `claim` 600,000, `withdrawal` 500,000, custom C-chain transactions 1,000,000. A sender's balance has to cover `maxFeePerGas * gasLimit` before the transaction runs, so the gas limit bounds how much headroom the fee ceiling can carry.
* `setClaimExecutors` and `setAllowedClaimRecipients` size their gas limit from the number of addresses being set: `max(1,000,000, 150,000 + 75,000 per address)`. This stays reproducible because the list is an argument every signer passes rather than something read from the chain. The floor covers clearing whatever list was stored previously, which the arguments do not reveal, and holds for any stored list within the supported 50-address bound below.
* `setClaimExecutors` and `setAllowedClaimRecipients` now refuse more than 50 addresses, including when `--gas-limit` is passed. The floor above can only be guaranteed to clear a stored list if that list is itself bounded, and these calls replace the stored list rather than adding to it, so a longer one cannot be assembled in several calls either. 50 is far beyond normal use.
* Fee values remain fixed constants rather than chain estimates, so that several ForDefi signers building the same transaction independently still arrive at the same hash.

### Added

* `--max-fee-per-gas <gwei>`, `--priority-fee-per-gas <gwei>`, and `--gas-limit <units>` for the C-chain commands, to raise the ceiling during congestion or lower it when the up-front balance requirement is a problem. All ForDefi signers of one transaction must pass the same values.

### Fixed

* `setClaimExecutors` and `setAllowedClaimRecipients` sized their gas limit from the raw argument list while the transaction was encoded from the same list with blank entries removed. Twelve addresses plus a discarded blank produced the same call as twelve addresses but a different gas limit, and so a different hash. The list is now normalized once, before both sizing and encoding.
* The private key signing path built its transaction from a copy that dropped the resolved transaction type. The Ledger path signed type 0 while the private key and ForDefi paths signed EIP-2930 (type 1), so the same transaction hashed differently depending on who signed it. Unsigned transaction files written by earlier versions still carry no type field and still resolve to type 1, so they remain valid.

## [[v4.3.3](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.3.3)] - 2026-09-01

### Fixed

* C-chain transactions were built with a hardcoded gas price of 200 gwei, which is below the Flare C-chain base fee floor of 500 gwei, so the network rejected them with `max fee per gas less than block base fee: maxFeePerGas: 200000000000, baseFee: 500000000000`. The gas price is now 2000 gwei. This affected `claim`, `withdrawal`, `optOut`, `setClaimExecutors`, `setAllowedClaimRecipients`, and custom C-chain transactions, on all three signing paths (private key, Ledger, ForDefi).

### Changed

* `claim` and `optOut` now use gas limits of 800,000 and 200,000 respectively, instead of a blanket 4,000,000. A sender's balance has to cover `gasPrice * gasLimit` before the transaction runs, even though unused gas is refunded, so the raised gas price would otherwise have required 8 FLR up front for a claim that costs around 0.12 FLR. The transactions whose cost depends on their arguments (`withdrawal`, `setClaimExecutors`, `setAllowedClaimRecipients`, and custom C-chain transactions) keep the previous limit.

## [[v4.3.2](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.3.2)] - 2026-08-24

### Changed

* The default value of `--delegation-fee` for `transaction stake` changed from `10` (10%) to `20` (20%). Runs that omit the flag now register the validator with a 20% delegation fee.

## [[v4.3.1](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.3.1)] - 2026-06-17

### Fixed

* Fixed mirror fund details returning `NaN FLR` totals and `null` stake amounts when the P-chain current validator API reports stake amounts as `weight` instead of `stakeAmount`.

## [[v4.3.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.3.0)] - 2026-04-30

### Changed

* Migrated package manager from Yarn to pnpm (with corepack).
* Migrated to shared Flare ESLint config (`@flarenetwork/eslint-config-flare`).
* Migrated to shared Flare Prettier config (`@flarenetwork/prettier-config-flare`).
* Updated `tsconfig.json` to target ES2024 with stricter type-checking options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`).
* Split tsconfig into base (type-checking) and `tsconfig.build.json` (compilation) with `rootDir: "src"`.
* Raised minimum supported Node.js version to 24 (`engines.node >= 24`).
* Replaced `==`/`!=` with `===`/`!==` across the codebase.
* Moved `typescript` and `rimraf` from dependencies to devDependencies.
* Moved pnpm settings to `pnpm-workspace.yaml` (`nodeOptions`, `minimumReleaseAge`).
* Bumped `go-flare` Docker image to `v1.13.0`; uses v1.13's built-in localflare genesis instead of a custom `genesis.json`.
* Filled in `LICENSE.md` with the MIT license text.

### Fixed

* Type-aware lint failures in CI caused by missing `@types/node` and `@types/bn.js`, an undeclared transitive `@scure/base` dependency, and `preserveSymlinks: true` blocking type resolution through pnpm's symlinks (these were masked locally by accumulated `node_modules` state).
* Trezor manifest missing the now-required `appName` field.
* `TransportNodeHid` type incompatibility with `AvalancheApp`/`EthApp` constructors under `exactOptionalPropertyTypes` (cast through `unknown`).

### Added

* Unit test infrastructure with mocha, chai, nyc, and tsx.
* Property-based tests for utility functions using `fast-check` (round-trip invariants for hex prefixes, decimal/integer conversion, public key compression, P-chain address derivation).
* Integration test infrastructure with docker-compose against go-flare v1.13.0, covering CLI smoke checks, read-only commands, full signing lifecycle, the public-key sign+send flow, and PTY-driven tests of the interactive menu (balance check, stake) using `node-pty`.
* Restored test staker keys under `local/` for local network bootstrap.
* `test:integration` script and `.mocharc.integration.yml`.
* `AGENTS.md` with project-specific instructions for AI coding agents (signing paths, unit conventions, pinned dependencies, gotchas), and a `CLAUDE.md` pointer for Claude Code users.
* `docs/COMMANDS.md` — behavioral specification for every CLI command.
* `CONTRIBUTING.md` with AI disclosure policy.
* `SECURITY.md` with vulnerability reporting and review scope.
* `CODEOWNERS` file.
* README header with Flare logo and navigation links.
* `.nvmrc` and `pnpm-workspace.yaml` configuration files.
* CI stages for linting, format checking, testing (with coverage), and building. `workflow:rules` and a reusable job-rules anchor ensure all jobs run on MRs and branch pushes (without duplicate pipelines). Integration tests run locally only — DinD shared runners can't cleanly handle the docker-compose volume mounts (see CONTRIBUTING.md).
* `test`, `test:coverage`, `lint:check`, `lint:fix`, `format:check`, `format:fix` scripts.

### Removed

* Custom `genesis.json` (now using v1.13's built-in localflare genesis).
* `.npmrc` (settings moved to `pnpm-workspace.yaml`).
* Legacy ESLint packages (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `globals`).

## [[v4.2.2](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.2)] - 2025-12-03

### Fixed

* For ForDefi: removed the `--fee-multiplier` option from the P-chain transaction commands and set a fixed fee price in the code.

## [[v4.2.1](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.1)] - 2025-11-26

### Changed

* Raised minimum supported Node.js version to 22 (`engines.node >= 22`).

## [[v4.2.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.0)] - 2025-11-19

### Added

* Etna P-chain transactions after the fork (for fork dates see the go-flare v1.12.0 [release notes](https://github.com/flare-foundation/go-flare/releases/tag/v1.12.0)).

## [[v4.1.5](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.5)] - 2025-08-27

### Fixed

* Fix bug in delegation when using a private key.

## [[v4.1.4](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.4)] - 2025-08-27

### Changed

* If a start time parameter is provided, it will be set to the current time (except for ForDefi transactions).

### Removed

* Querying pending validators is no longer supported since API `getPendingValidators` is no longer available.

## [[v4.1.3](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.3)] - 2025-08-11

### Added

* Set default `--start-time` for ForDefi signing to a fixed timestamp (1) instead of the current date to ensure consistent transaction hashes across signers.
