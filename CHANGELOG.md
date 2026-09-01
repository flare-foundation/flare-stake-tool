# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
