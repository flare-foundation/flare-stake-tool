# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [[v5.0.0](https://github.com/flare-foundation/flare-stake-tool/releases/tag/v5.0.0)] - Unreleased

Every transaction type is now built once, signed by one of three signers (private key, Ledger, or the unsigned-file flow used by ForDefi), and sent and confirmed by the same code. The three paths used to be separate copies that behaved differently. Commands, flags and the transaction file formats are unchanged, except as listed under Breaking changes.

### Breaking changes

* `-f`/`--fee` for `exportCP` and `importPC` is the total fee in FLR and is paid exactly, on every path. The private key path used to ignore it and pay an estimate.
* Amounts (`-a`, `-f`, `--delegation-fee`) refuse commas (`1,5` used to become 15) and more decimals than the chain holds (they used to be cut off).
* `--gas-limit`, `--max-fee-per-gas` and `--priority-fee-per-gas` take plain digits only; `0x5208`, `2.1e4` and `+25` used to be accepted. So do `customCChainTx --value` (wei) and `--nonce`, which 4.4.0 also took in hex (`--value 0xde0b6b3a7640000`, `--nonce 0x5`).
* An empty value (`-a ""`, `-f ""`, `--nonce ""`, `--value ""`, `--data ""`, `--delegation-fee ""`, `--auto-compound-shares ""`, the C-chain gas options, `--env-path ""`, `--ctx-file ""`, `--rpc-url ""`, `--api-key ""` and `--vault-id ""`), or one of spaces only, is refused. It used to count as a missing option, so `claim -a "$AMT"` with `AMT` unset claimed every reward, and `--auto-compound-shares "$X"` with `X` unset set auto-compounding to 0. `customCChainTx --data ""` is refused as well: 4.4.0 failed on it, and on a missing `--data`, whose default was `""`, which ethers refuses. The default is now `0x`, no calldata.
* A mixed-case C-chain address must have a valid EIP-55 checksum (it used to be corrected). P-chain addresses (`--transfer-address`, `--owner-address`) must belong to the selected network.
* `setClaimExecutors` needs `--executors` and `setAllowedClaimRecipients` needs `--recipients`; without them the stored list was cleared. Pass `""` to clear it.
* `info` and `send` refuse `--get-hacked` without `--env-path`, and choose the account in the same order as transactions.
* Key files (`--env-path`) are read only from the file: a `PRIVATE_KEY_HEX` or `PRIVATE_KEY_CB58` exported in the shell no longer counts, nor wins over the file's (4.4.0 loaded the file into the environment without overriding it). A file with both lines must hold the same key in both (4.4.0 ignored `PRIVATE_KEY_CB58` when `PRIVATE_KEY_HEX` was set), so delete the line you don't use; the README's template had both.
* Without `--derivation-path`, `--ledger` signs at the derivation path of a Ledger `ctx.json` and refuses a Ledger without the context's key, as interactive mode does. 4.4.0 always used `m/44'/60'/0'/0/0`, so with a context saved at another index the same command line now signs for the context's account; before, a context made at another path signed for, and showed, another account.
* `--ledger` with `--get-hacked`, and `init-ctx --ledger` with `-p`, are refused before the key file or the device is opened. One silently won: the key file signed, and `init-ctx` saved the Ledger's key.
* Transaction ids (`-i`) may contain only letters, digits, `.`, `_` and `-`, and can't start with `.`; an id such as `../x` named a file outside `ForDefiTxnFiles`. Rename an older file with another id to send it.
* `info network` and `info mirror` are removed.
* Output: the banner is shown only in interactive mode; progress messages (such as `Using network: …` and "Transaction … submitted, waiting"), warnings and errors go to stderr, while results, including the transaction id, stay on stdout; every error exits with code 1. Result lines a script may read changed: a C-chain unsigned file prints `Unsigned transaction <id> constructed` (was `Transaction <id> constructed`); `Used fee of …`, printed before the transaction hash, is now `Fee paid: …` after it; `forDefi sign` prints `Transaction <id> sent to ForDefi (ForDefi transaction id …)` and the ForDefi hash (was `Transaction with hash … sent to the ForDefi`); and `ForDefi hash: …` is no longer the last line, as the amount, fee, nonce and gas limit follow it (see Changed). Amounts on localflare are shown in `LFLR` (was `PHT`).
* `interactive` refuses unknown options, options it doesn't use (`--network`, `--ledger`, `--blind`, `--derivation-path`, `--ctx-file`, `--env-path`, `--get-hacked`), and running without a terminal.
* `send`, `forDefi`, `info` (and its shortcuts) and `init-ctx` refuse the C-chain gas options (`--gas-limit`, `--max-fee-per-gas`, `--priority-fee-per-gas`), which they ignored: `send --max-fee-per-gas …` looked like a re-priced send, but the signed transaction went out as it was signed.
* `transaction <type>` refuses an option given on the command line that the type doesn't use, such as `importCP -a 5`, `exportPC -f 1`, `--nonce` on another type than `exportCP`, or the C-chain gas options (`--gas-limit`, `--max-fee-per-gas`, `--priority-fee-per-gas`) on a P-chain or atomic type. They were ignored, so a value the user meant to pin wasn't. `-i` and `--threshold 1` are taken by every type.
* `addAutoRenewedValidator` takes one `--owner-address`, as documented. Several made a validator authority that any one of them controlled alone (1-of-N), whatever `--threshold` said; `--threshold` other than 1 is refused.
* `withdrawal`, `setClaimExecutors`, `setAllowedClaimRecipients` and `customCChainTx` sign and send at once with `--get-hacked` or `--ledger`; 4.4.0 ignored both flags for them and always wrote an unsigned file. So that a 4.x command line meant to write a file for review doesn't send instead, these four refuse `-i` together with `--get-hacked` or `--ledger`: leave out `-i` to sign and send, or the signer flag to write the file.
* `customCChainTx` has a 300,000 gas limit by default (was 1,000,000); heavier calls need `--gas-limit`. See Changed for the other gas limits.

### Fixed

* Typos and stale state that made the tool sign or send something else than intended:
  * A `PRIVATE_KEY_CB58` with a mistyped character is refused. flarejs doesn't check the checksum, so the tool loaded another valid key and showed and signed for that account.
  * A `--node-id` with a mistyped character is refused, also at the interactive prompt. It was encoded as another node, so `stake` and `addAutoRenewedValidator` locked the stake on a validator nobody runs.
  * Building `-i <id>` is refused when that id already has a signed file; `send -i` would have sent the old signed transaction.
  * `send -i` checks that the signature belongs to the configured account, and marks the file as sent as soon as the node takes the transaction, so a wait that times out can't lead to a second submission. The mark is removed if the chain refuses the transaction.
  * A Ledger is held to the account it was connected with: if another device or seed answers later, or a reused Ledger `ctx.json` belongs to another device, the tool stops and names both addresses.
  * C-chain EVM transactions signed with `--get-hacked` or `--ledger` without `--nonce` take the next nonce after the pending ones. Reusing the nonce of a waiting transaction got it refused or replaced. `exportCP` keeps the accepted nonce on every path, since the C-chain checks an atomic transaction's nonce against the accepted state.
  * The zero address is refused as the `withdrawal` or `claim` recipient, as an executor or an allowed claim recipient, and as `customCChainTx --to` with a value. No one holds its key, so a script defaulting an address variable to it burned the funds.
  * Times after the year 275760, periods above 2^64−1 seconds, and P-chain and atomic amounts above 2^64−1 nFLR (about 18.4 billion FLR) are refused; they produced a malformed transaction that was signed anyway. The amount limit also holds for an amount plus its fee, and for an export or import of UTXOs that each fit.
  * The limit of three nodes per account and the delegation checks (a current validator, within its period) run on every path, including the unsigned-file path. The count starts from now, since the chain ignores `--start-time`, and a node that doesn't list all delegations is refused.
* P-chain and atomic transactions:
  * `exportCP` exports exactly the amount given (the Ledger path added the P-chain fee).
  * `exportPC` without `-a` exports the spendable balance minus the fee; it always failed with insufficient funds. Small UTXOs may stay behind on the P-chain.
  * `importPC` imports only UTXOs the account can spend alone; a co-owned or time-locked UTXO made the node refuse the import. Time-locked UTXOs stay pending even after the lock ends (a flarejs limitation). An import with nothing to import is refused.
  * P-chain transactions leave out, with a warning, the UTXOs the account can't spend alone: one that needs another key, or whose owners' lock still runs. Anyone can send an account such a stakeable-locked UTXO, and flarejs then failed every stake, delegation and auto-renewed validator of that account ("No addresses match UTXO owners").
  * P-chain transactions leave out UTXOs worth less than the fee of spending them (about 0.00074 FLR), stakeable-locked ones included, with a warning. Anyone can send such dust to any address, and flarejs spent it first when the node listed it first, so a few hundred made a transfer, stake or export go over the gas limit. UTXOs worth a little more than that fee are still spent in the node's order, so a few hundred of those can still do it.
  * `importPC` and `importCP` skip UTXOs worth less than the fee of importing them, and import the largest first up to the chain's gas limit: about 80 at a time on the C-chain, about 300 on the P-chain. Before, they took every pending UTXO, so dust or too many UTXOs made the import fail. A warning says what was left pending.
  * An import whose fee takes everything it imports is refused, and the UTXOs stay pending for a later import. `importPC` built a 0-value C-chain output, which the chain refuses (an estimate above the imported value, or `-f` equal to it); `importCP` built an import with no output, which the P-chain accepts, burning the UTXOs. An `importCP` whose UTXOs don't cover the fee at all is refused as well: it spent one of them a second time as a P-chain UTXO, which the node refuses.
  * Unsigned files treat every time-locked P-chain UTXO as still locked, so ForDefi co-signers building on either side of the second a lock ends get the same transaction. Such a UTXO isn't transferred, exported or used for a fee, even once its lock has passed (use `--ledger` or `--get-hacked`); stake and delegate can still stake a stakeable-locked one, and the stake keeps its lock.
  * `exportPC` without `-a` checks time locks the way flarejs does; it failed in the second a lock ended.
  * UTXOs are read past the node's page of 1024, so large accounts see their whole balance.
  * `--delegation-fee` is converted exactly (`0.07` gave 700.0000000000001 shares).
* C-chain transactions:
  * `claim`, `setClaimExecutors` and `setAllowedClaimRecipients` use the C-chain chain id, which differs from the network id on Songbird and Coston.
  * `withdrawal` and `claim` amounts take 18 decimals (they were cut to 9).
  * `--nonce` must be a non-negative integer, and is stored as a number in unsigned files (the hash is unchanged).
  * C-chain commands and `exportCP` print the nonce they used, C-chain commands their gas limit (the default of `claim` and `withdrawal` depends on whether the recipient has contract code), `claim` the amount it takes (all unclaimed rewards without `-a`) and `setClaimExecutors` the executor fees it pays: values read from the chain, which ForDefi co-signers had no way to see and pass in turn.
* Signing:
  * `send -i` accepts `v` as `1b`/`1c` as documented, and fills the validator-authority credential of `setAutoRenewedValidatorConfig`. A signature with a high `s` (as Go's `crypto/ecdsa` or a KMS may give) is sent as its low-`s` twin, which the node and ethers require; an `r` or `s` of 0 or above the curve order, or a signature no key recovers from, is refused with a message saying so (it used to be an empty error or "sqrt invalid").
  * A given `--ctx-file` that doesn't exist is refused by every command but `init-ctx`, whatever else selects the account; `send` skipped the signer check then, and `--ledger` ignored it.
  * The Ledger Ethereum app is refused for P-chain and atomic transactions, which the node never accepts from it; the tool asks for the Flare app.
  * Ledger: the Avalanche app works with multi-digit path indices (`m/44'/60'/0'/0/10`), a signature with an impossible `v` is refused, and the USB connection is always closed.
  * Ledger blind signing (the Avalanche app, or the Flare app for a type it can't parse) prints the transaction hash on stderr first, to compare with the one the device shows.
  * `forDefi sign` labels the ForDefi id correctly, and ForDefi errors show the HTTP status and response instead of misleading messages. The API token is masked in them, also where the response is cut short, and a ForDefi transaction id that holds it is not saved into the unsigned file.
  * Unsigned files record the account they were built for: `signatureRequests[0].signer` holds its P-chain address (earlier versions wrote `""`), and C-chain files get a top-level `signer` with its C-chain address. `forDefi sign` refuses a vault of another account, and `forDefi fetch` and `send` a signature by another account or over another transaction, so a mixed-up context can't have vault B sign A's transaction with A's nonce, and a wrong answer doesn't replace a good signature not sent yet. The field is not part of the hash; files from earlier versions, without it, work as before.
  * `send` and `forDefi sign` refuse a file built for another network than the selected one (the network id of a P-chain or atomic transaction, the chain id of a C-chain one) before submitting it or posting it to ForDefi; the node refused it with a less clear error, and ForDefi signed it for the other network. A C-chain transaction without a chain id (0), which every EVM chain would take, is refused as well; no version of the tool wrote one. `forDefi sign` takes `--network` as transactions do, else the context's network.
  * `forDefi sign` compares the context's public key with the vault's as keys, so a context holding it uncompressed or with `0x` is accepted.
  * `forDefi sign` and `send` refuse a file whose `message` is not the hash of its transaction, whose `unsignedTransactionBuffer` is another transaction, or whose `forDefiHash` (the hash printed at build time for co-signers to compare) is another one. ForDefi signed the file's `message` as it was, so a changed file could show one transaction and get another one's hash signed. `forDefi sign` prints the hash it posts.
  * Transaction files and `ctx.json` are never overwritten by a write that started before they appeared, and rewrites go through a temporary file, so an interrupted write can't leave half a file. A repeated `forDefi fetch` with the same signature leaves the signed file as it is, and a sent file is never replaced.
  * A `ctx.json` or transaction file that is not JSON or lacks a field the tool reads, and a ForDefi answer of the wrong shape, are refused with the file (or answer) and the field named, instead of failing later with an unrelated error. Files written by earlier versions load as before, unknown fields included.
  * `init-ctx` honours `--derivation-path` and stores the P-chain address in `flareAddress`.
  * A derivation path, given with `--derivation-path` or saved in `ctx.json`, must be `m/` and decimal indices below 2^31, each optionally hardened with `'`. The Ethereum app read `m/44'/60'/0'/0/1O` (letter O) as index 1 and signed for that account, where the Flare and Avalanche apps refused it.
  * `init-ctx --ledger` prints the address the device is about to show, and writes no context file when the device shows another address than the one of its key.
* Interactive mode:
  * Declining the import of a move says that its export was sent and that its funds wait for "Import Funds".
  * Before a transaction is signed, the menu shows what it does, read from the built transaction: the account, the network, the amount, the recipient or node, the end time with its date, the period, the fee, and for C-chain transactions the nonce and the most the gas can cost. It is signed only after a confirmation, which defaults to No; declining the export of a move skips its import. A typed fee far above the estimate used to be paid without a word.
  * The C-chain export and import fee defaults to the current estimate instead of 1 FLR (about 170 times the real cost). A typed fee below the current cost asks for confirmation.
  * Moves between the chains import only after their own export has arrived.
  * Claiming and stopping auto-renewal check the node's network before showing the rewards or the cycle end read from it; they were shown under the chosen network's name from a node on another one.
  * Connecting a Ledger no longer deletes `ctx.json`; another context is replaced only after confirmation and kept as a `.bak` file.
  * Asking whether to reuse `ctx.json`, the menu shows the address of its public key, which the session uses, instead of the cached `ethAddress`, which may be stale or edited.
  * A new Ledger context is saved only after the device has shown the chosen address and the user approved it, as with `init-ctx --ledger`. The listed addresses come from keys the host received, so a substituted key was saved and later trusted without the device ever showing it.
  * A failed action or wallet connection no longer ends the session, and the wallet menu has a Quit entry.
  * Ctrl-C at a question, or Ctrl-D on an empty answer (the end of input), ends the session with exit code 130 instead of 0, so a script sees it was cancelled; Ctrl-D also printed a stack trace. Quit still exits with 0.
  * Invalid amounts, fees, periods, end times, delegation fees, node ids, P-chain addresses and BLS keys are refused at the prompt, which asks again (a BLS key or signature that is not a point of its curve, or a signature that is another key's proof of possession, too); a delegation fee of `10%` used to fail only after both BLS values were entered. The delegation fee prompt says that Enter accepts 20%.
  * `interactive --help` prints help instead of starting a session, and a bad node URL is reported before the banner.
* Command line:
  * Transactions, `send` and `forDefi sign` print `Using network: …` on stderr (4.4.0 printed it on stdout, for every command). Without `--network` and a context file, transactions, `send`, `info` and `init-ctx` warn that they use Flare.
  * The shortcuts (`balance`, `exportCP`, …) and `interactive` work after global options, as in `--network costwo balance`.
  * `--derivation-path` without `--ledger`, which nothing reads, gets a warning.
  * An unknown `--network` is refused with the networks listed, and an end or start time that is neither a unix time nor a duration says so ("use seconds" read as a time gave a 1970 date).
  * `<command> --help` lists the global options (`--network`, `--ledger`, the C-chain fee options, …) after its own; a command refuses those it doesn't use.
  * `-i <id>` given before a command (`-i myid exportCP …`) says that `-i` there starts interactive mode and that the id goes after the command, instead of reporting the command's first option as unknown.
  * An end time that is not in the future gets a warning (`-e 1209600` is a unix time, not 14 days).
  * A BLS key or signature that is not a point of its curve, or is its point at infinity, or a signature that is not the key's proof of possession (key and signature copied from two nodes), is refused when parsed, naming the option; flarejs failed at build time with "Cannot find square root", and the node refused a mismatched pair.
  * A start or end time that looks like milliseconds (`-e 1700000000000`, the year 55840 as seconds) gets a warning, on the command line and in interactive mode.
  * An unknown `info`, `transaction` or `forDefi` type is refused with the allowed ones listed (also in `--help`), and a missing or invalid transaction option is reported before the signer, so `delegate` without `--node-id` says so instead of asking for `-i`.
  * A failed node request names its cause and the node, as in `fetch failed (connect ECONNREFUSED …; node http://…)`, instead of only `fetch failed`. URL credentials and the API key are masked in every error, and the API key, URL passwords and the ForDefi token (16 characters or more) in everything else the tool prints, such as a node's answer that repeats the key; a URL username or a shorter secret is left there, as it could match part of an address or a hash. A JSON error no longer quotes the start of the text, which could be part of a key file given as a context file, or of a node's answer that repeats the key.

### Changed

* Without `-f`, `exportCP` and `importPC` pay twice the current C-chain base fee, since it can double in about a minute after Granite. That headroom costs about 0.0056 FLR at the 500 gwei floor. The unsigned-file path still requires `-f`.
* Every transaction prints its id as soon as the node takes it, then waits until it is accepted. P-chain and atomic transactions print the fee they burn, also for unsigned files, so ForDefi signers see it before signing, and `exportPC`, `importCP` and `importPC` the amount they move, which comes from the chain (co-signers of `exportPC` pass it as `-a`).
* C-chain gas limits match actual use, because since Helicon a transaction pays for at least half of its limit. To an ordinary account: `withdrawal` 100,000 and `claim` 200,000. To a contract: 500,000 and 600,000. `claim --wrap` uses 600,000 and `customCChainTx` 300,000. `setClaimExecutors` and `setAllowedClaimRecipients` keep their 1,000,000 floor. Signed files from earlier versions keep their old limits; rebuild them to pay less.
* `stake` and `delegate` warn that `--start-time` doesn't delay the stake (the chain starts it when it accepts the transaction). The value still goes into the transaction, so ForDefi co-signers must pass the same one. The interactive menu no longer asks for a start time.
* The interactive menu runs the same code as the commands.
* `@flarenetwork/flarejs` 4.1.1 → 5.2.0 (pinned), using only the Etna builders. Built transactions are byte-identical.
* Dependencies updated (Ledger packages, `commander` 14, `dotenv` 18, `ethers` 6.17, `inquirer` 8.2 and the dev toolchain); `chalk` and `clear` replaced by Node built-ins. `pnpm audit` is down from 122 findings (2 critical) to 5, none above moderate.

### Added

* Auto-renewed validators (Helicon, ACP-236): `transaction addAutoRenewedValidator`, and `transaction setAutoRenewedValidatorConfig` to change the period or stop renewal (`--period 0`). They work on every signing path and in the interactive menu, and are refused where Helicon is not active. `info validators` shows their cycle, on stderr, so that stdout stays the JSON.
* Durations for `--end-time`, `--start-time` and `--period`, such as `2d12h` or `90m`. An end or start time given as a duration is added to now and printed as a unix time, which ForDefi co-signers must pass instead; a `--period` duration is just converted to seconds.
* `--rpc-url` (`FLARE_RPC_URL`) and `--api-key` (`FLARE_API_KEY`) for another node or an API gateway. The tool checks that the node belongs to the selected network. The API key is `--api-key`, else the one written into the node URL (`?x-apikey=`), else `FLARE_API_KEY`, which goes only to the node of `FLARE_RPC_URL` or the network's default node, never to one given with `--rpc-url`, so that a key set for one gateway doesn't reach any host a command line names. A key that would go over plain `http` to another machine gets a warning. A request carrying the key refuses a redirect instead of taking the key to the host it names. A refused request (HTTP 401 or 403, an error page, or a JSON answer without a result) says to check `--rpc-url` and the API key.
* `withdrawal`, `setClaimExecutors`, `setAllowedClaimRecipients` and `customCChainTx` can be signed with `--get-hacked` or `--ledger` (see Breaking changes).
* `init-ctx --vault-id` for ForDefi contexts, `--version`, and `--gas-limit`, `--max-fee-per-gas` and `--priority-fee-per-gas` for `interactive`.
* Tests: `pnpm test` replays recorded scenarios of every transaction type and signing path offline; the integration tests run against a running localflare (`LOCALFLARE_RPC_URL`).

### Removed

* `info network` and `info mirror`, with their interactive menu entries.
* Code no command reached (the React UI, the Trezor module, browser utilities, the `local` network alias) and unused dependencies, including `web3`, `bn.js`, `@mui/*` and `@trezor/connect-web`.
* `scripts/get-tx.sh`, which was not shipped and called a wrong endpoint (`/ext/P` instead of `/ext/bc/P`, and `costwo-api` for Coston2).

### Deprecated

* `--blind` and `--threshold` have no effect (they never had any) and are kept for compatibility; `--threshold` accepts only 1.

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
