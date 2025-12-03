# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [[v4.1.3](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.3)] - 2025-08-11

### Added

* Set default `--start-time` for ForDefi signing to a fixed timestamp (1) instead of the current date to ensure consistent transaction hashes across signers.

## [[v4.1.4](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.4)] - 2025-08-27

### Changed

* If a start time parameter is provided, it will be set to the current time (except for ForDefi transactions).

### Removed

* Querying pending validators is no longer supported since API `getPendingValidators` is no longer available.

## [[v4.1.5](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.1.5)] - 2025-08-27

### Fixed

* Fix bug in delegation when using a private key.

## [[v4.2.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.0)] - 2025-11-19

### Added

* Etna P-chain transactions after the fork (for fork dates see the go-flare v1.12.0 [release notes](https://github.com/flare-foundation/go-flare/releases/tag/v1.12.0)).

## [[v4.2.1](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.1)] - 2025-11-26

### Changed

* Raised minimum supported Node.js version to 22 (`engines.node >= 22`).


## [[v4.2.2](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v4.2.2)] - 2025-12-03

### Fixed

* For ForDefi: removed the `--fee-multiplier` option from the P-chain transaction commands and set a fixed fee price in the code.