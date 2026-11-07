# Command reference

Behavioral specification for every CLI command. This is the source of
truth for what each command should do. The integration tests in
`test/integration/` are the executable form of this spec.

For exact flags, see `flare-stake-tool <command> --help`. This document
focuses on inputs / outputs / side effects / failure modes.

---

## Global options

| Flag | Purpose |
|---|---|
| `--network <flare\|songbird\|costwo\|coston\|localflare>` | Network to act on |
| `--ledger` | Sign transactions on a connected Ledger device. The device must keep the key it had at the first read: another Ledger connected while the command runs is refused before anything is signed |
| `--blind` | Accepted for compatibility and has no effect: the signing mode follows the open Ledger app (the Flare app parses the transaction and falls back to signing its hash only for a type it cannot parse; the Avalanche app signs the hash). Before signing a hash the tool prints it on stderr, to compare with the one the device shows |
| `--derivation-path <path>` | Ledger derivation path. Without it, `--ledger` with a Ledger context file (`--ctx-file`, default `ctx.json`) uses the context's path and refuses a Ledger that doesn't have the context's key; otherwise `m/44'/60'/0'/0/0` |
| `--ctx-file <file>` | Context file written by `init-ctx` (default `ctx.json`, used when it exists). A file given with `--ctx-file` must exist, whatever else selects the account or network, also for `forDefi fetch`, which doesn't read it: a missing one is refused, not ignored (`init-ctx` writes it instead) |
| `--env-path <path>` | `.env` file containing `PRIVATE_KEY_HEX` and/or `PRIVATE_KEY_CB58`. A `PRIVATE_KEY_CB58` whose checksum doesn't match (a typo) is refused |
| `--get-hacked` | Use the env file's private key for direct in-process signing |
| `--rpc-url <url>` | Node base URL replacing the network's default (or env `FLARE_RPC_URL`); a full endpoint URL such as `https://host/ext/info?x-apikey=KEY` is accepted. The node must be on the selected network: its network ID is checked before anything else and a mismatch stops the command. A failed request is reported with its cause and the node's URL, such as `fetch failed (connect ECONNREFUSED 127.0.0.1:9650; node http://localhost:9650)`; URL credentials and the API key are masked as `***` in every error |
| `--api-key <key>` | API key sent as the `x-apikey` header with every request, for staging deployments and private nodes. Without it, the node URL's own `x-apikey` is used, then env `FLARE_API_KEY`. A key that would go over plain `http` to a host other than `localhost`, 127.x.x.x or `[::1]` gets a warning on stderr (the key itself is not printed) |

Global options can come before or after the command. The transaction types
(`exportCP`, `stake`, …) can be given without `transaction`, and `addresses`,
`balance` and `validators` without `info`, also after global options:
`flare-stake-tool --network costwo balance` is
`flare-stake-tool info balance --network costwo`.

`-a`/`-f` (amount/fee) are in **FLR** on every signing path, written with `.`
as the decimal separator; commas are refused (`1,5` and `10,000` are errors,
write `1.5` and `10000`). P-chain and atomic amounts and fees take at most 9
decimals (nFLR); the C-chain amounts of `withdrawal` and `claim` take up to 18
(wei). More non-zero decimals are an error rather than being cut off.
An empty value (`-a ""`) is refused for `-a`, `-f`, `--nonce`, `--value`,
`--delegation-fee`, `--auto-compound-shares` and the gas and fee flags, whose
absence means a default:
leave the option out to get the default. `--executors ""` and
`--recipients ""` clear a list.
`--gas-limit` (gas units), `--max-fee-per-gas` and `--priority-fee-per-gas`
(gwei) are positive integers written as plain digits: `0x5208`, `2.1e4` and
`+25` are refused.
`--nonce` is a non-negative integer. Without it, a C-chain transaction signed
with `--get-hacked` or `--ledger` takes the next nonce after the account's
transactions still waiting in the node, so it neither reuses nor replaces one
of them; an unsigned file and `exportCP` take the next nonce after the accepted
ones. Times (`-e`,
`-s`, `--period`) are unix seconds or durations such as `2d12h` (units w, d, h,
m, s); an end time given as a duration is added to now and the resolved value is
printed. A time after the year 275760 (`8640000000000`) or a period above
2^64−1 seconds is refused. A plain integer is a unix time, so an end time that is not in the
future (such as `-e 1209600` meant as 14 days) gets a warning on stderr; the
network then rejects the transaction. Every path prints the transaction id and
waits until the transaction is accepted; P-chain and atomic transactions also
print the fee they burn (`Fee paid: …`, or `Fee: …` for an unsigned file). The
unsigned-file (ForDefi) path requires `-f` for `exportCP` and `importPC`.
P-chain transactions leave out UTXOs worth less than the fee of spending them
(the gas of one input at the lowest P-chain price, about 0.00074 FLR on Flare),
which anyone can send to any address and which flarejs would otherwise spend
first when the node lists them first; a warning says how many were left out.
This includes stakeable-locked UTXOs, which anyone can send as well; one whose
lock still runs is measured by the slightly larger stakeable-locked input that
spends it, one whose lock has ended by a plain input (an unsigned file counts
every lock as running).
Every error exits with code 1.

---

## init-ctx

Create a `ctx.json` file describing how to operate the tool for subsequent
commands.

| Aspect | Detail |
|---|---|
| Inputs | One of: `-p <publicKey>`, `--ledger` (the address at `--derivation-path`). `--network <name>`. Optional `--vault-id <id>`, stored for ForDefi. |
| Side effects | Writes `ctx.json` (or the `--ctx-file` path) in the current working directory |
| Output | Success message. With `--ledger`, first the C-chain address (on stderr), which the device then shows: approve it only if they match |
| Failures | Throws if neither `-p` nor `--ledger` is given, if the file already exists, if `-p` is not a valid secp256k1 public key, or if the Ledger shows another address than the one of the key it returned, or the user rejects it (exit code 1, no file written) |

The resulting file contains the public key, derived addresses, and the
network. It does **not** contain the private key.

---

## info \<addresses\|balance\|validators\>

Read-only queries against the configured network. Requires either a
context file (`--ctx-file ctx.json`), `--ledger`, or
`--get-hacked --env-path`. The account is chosen as transactions choose the
one they sign for (and `send` the one it checks the signature against): the
key file with `--get-hacked --env-path`, else the Ledger with `--ledger`, else
the key file of `--env-path`, else the context file.

### info addresses

Output the C-chain hex address, P-chain bech32 address, and compressed
secp256k1 public key derived from the configured key/context.

### info balance

Output the C-chain (in wei → display as FLR with 18 decimals) and P-chain
(in nFLR → display as FLR with 9 decimals) balances for the configured
addresses.

### info validators

Output the list of current validators on the P-chain. Each entry includes
nodeID, weight, start/end times, reward owner, delegators.

---

## transaction exportCP

Move FLR from the C-chain to the P-chain (atomic export step).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>` (FLR, required), `-f <fee>` (FLR; total fee. Optional for the private key and Ledger paths, where it is estimated at twice the current base fee when omitted; required for the unsigned-file path) |
| Side effects | Submits an atomic export tx on the C-chain; exactly `amount` is exported and the fee is paid from the C-chain account. The P-chain import fee is paid from the imported funds on import. |
| Output | Tx hash, "sent to the network" |
| Failures | "insufficient funds" if C-chain balance < amount + fee. Network parse errors if amount serialization changes between go-flare versions. |

**Always followed by** `transaction importCP` to claim the UTXO on the P-chain.

---

## transaction importCP

Complete the C→P transfer started by `exportCP`. Reads pending UTXOs from
the C-chain source.

A UTXO worth less than the fee its own input adds at the lowest P-chain price
(250 nFLR per gas on Flare, about 0.00074 FLR) costs more to import than it
brings, and is skipped. One import holds at most about 300 UTXOs (the
P-chain's gas capacity, less one second of refill as headroom); with more, the
largest are imported and the rest stay pending for the next import. Both rules
use fixed values from the chain's fee config, so every ForDefi co-signer
imports the same UTXOs. A warning says how many UTXOs were left out and what
they hold.

| Aspect | Detail |
|---|---|
| Inputs | None (uses configured key/context) |
| Side effects | Submits an atomic import tx on the P-chain |
| Output | Tx hash, "sent to the network"; a warning when UTXOs were skipped or left for the next import |
| Failures | "no UTXOs available to import" if the export hasn't propagated yet (wait a few seconds), or "Nothing worth importing" when every pending UTXO is worth less than the fee of importing it. A large import right after a burst of P-chain transactions can be refused with "Gas usage of transaction (…) exceeds capacity (…)"; the chain refills its capacity within seconds, so run it again |

---

## transaction exportPC

Move FLR from the P-chain to the C-chain (reverse of exportCP).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>` (FLR, optional on every path — defaults to the spendable P-chain balance minus the fee of the export, without dust, see above; at the unsigned-file price a UTXO worth a little more can still stay behind, as flarejs leaves out an input that costs more than it adds) |
| Side effects | Submits an atomic export tx on the P-chain |
| Output | Tx hash, "sent to the network" |
| Failures | "Export amount is smaller than or equal to zero" if the spendable P-chain balance does not cover the export fee |

---

## transaction importPC

Complete the P→C transfer started by `exportPC`. Reads pending UTXOs and
imports those the account can spend alone: one that needs more signatures (a
2-of-2 that includes the address) or has a time lock is left pending. flarejs
checks time locks against time 0, so a time-locked UTXO cannot be imported
even once its lock has passed.

A UTXO worth less than the fee its own input adds at the lowest C-chain base
fee (500 gwei, about 0.00054 FLR) costs more to import than it brings, and is
skipped. One import holds at most about 80 UTXOs (the C-chain's atomic gas
limit of 100,000); with more, the largest are imported and the rest stay
pending for the next import. Both rules use fixed values, so the same UTXOs
are imported with or without `-f`, and by every ForDefi co-signer. A warning
says how many UTXOs were left out and what they hold.

| Aspect | Detail |
|---|---|
| Inputs | `-f <fee>` (FLR; total fee. Optional for the private key and Ledger paths, where it is estimated at twice the current base fee when omitted; required for the unsigned-file path). |
| Side effects | Submits an atomic import tx on the C-chain |
| Output | Tx hash, "sent to the network"; a warning when UTXOs were skipped or left for the next import |
| Failures | "Nothing to import from the P-chain" if exportPC hasn't propagated to the C-chain yet (3s delay typically suffices on local), "… that this account can spend alone" when only UTXOs it cannot spend alone are pending, or "Nothing worth importing" when every pending UTXO is worth less than the fee of importing it. Refused before signing if the built transaction would not pay exactly `-f` (or would pay nothing when estimated). |

---

## transaction stake

Register a new fixed-term validator using locked P-chain funds. (For validators that renew automatically see `addAutoRenewedValidator`.)

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>`, `-a <amount>` (≥ network minimum), `-e <endTime>` (unix seconds or duration from now), `--delegation-fee <pct>` (default 20), `--pop-bls-public-key <hex>` (48 bytes), `--pop-bls-signature <hex>` (96 bytes), optional `-s <startTime>` |
| Side effects | Locks the staked amount on the P-chain for the duration. Funds return to the staking address on `endTime`. |
| Output | Tx hash, "sent to the network" |
| Failures | A `-n` node id that doesn't start with `NodeID-` or whose checksum doesn't match (a typo), refused before anything is built (also for `delegate`, `addAutoRenewedValidator`, `setAutoRenewedValidatorConfig` and the interactive prompt, which asks again). "Insufficient funds" if P-balance < stake amount. Validator already registered. Invalid BLS signature. End time before start time or after the configured maximum. The account already stakes to three other nodes in an overlapping period (checked on every path, also for `delegate` and `addAutoRenewedValidator`; refused when the node counts a validator's delegations without listing them all, since the account's could be among those left out). |

`-s <startTime>` does not delay the stake: since the Durango upgrade the network
starts a stake when it accepts the transaction (the tool warns when `-s` is
given). Without `-s` the transaction carries the current time, or `1` on the
unsigned-file path. `pop-bls-*` come from the running node (`info.getNodeID`
JSON-RPC).

---

## transaction delegate

Delegate P-chain funds to an existing validator.

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>`, `-a <amount>` (≥ network minimum), `-e <endTime>` (unix seconds or duration from now), optional `-s <startTime>` |
| Side effects | Locks the delegated amount until endTime; rewards accrue per the validator's delegation fee |
| Output | Tx hash, "sent to the network" |
| Failures | "Unknown node id" when the node is not a current validator. End time after the validator's current period (for auto-renewed validators: the current cycle). Insufficient P-chain funds. The max-three-nodes rule (every path). |

As for `stake`, `-s <startTime>` does not delay the delegation; it starts when the network accepts the transaction.

---

## transaction transfer

Move FLR between two P-chain addresses (P → P).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>`, `--transfer-address <P-...>` (a P-chain address of the selected network, e.g. `P-flare1…` on Flare) |
| Side effects | Submits a P-chain base tx |
| Output | Tx hash, "sent to the network" |
| Failures | Invalid bech32 address, or an address of another network or chain (`P-costwo1…` on Flare, `C-flare1…`), refused before anything is built. Insufficient P-chain funds. |

---

## transaction addAutoRenewedValidator

Register an auto-renewed validator (Helicon upgrade, ACP-236). There is no end
time: validation starts at the current chain time and is renewed every
`--period` until the period is set to 0, as long as the node keeps the required
uptime.

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>`, `-a <amount>` (≥ network minimum), `--period <seconds\|duration>` (e.g. `14d`; within the network's minimum and maximum validation duration), `--delegation-fee <pct>` (default 20), `--pop-bls-public-key <hex>` (48 bytes), `--pop-bls-signature <hex>` (96 bytes), optional `--owner-address <P-…>...` (the validator authority allowed to change the configuration later, P-chain addresses of the selected network; default: own address), optional `--auto-compound-shares <millionths>` (share of rewards restaked each cycle; rewards are 0 on Flare networks, so it has no effect) |
| Side effects | Locks the stake on the P-chain. The stake returns to the staking address at the end of the cycle in which auto-renewal was stopped. |
| Output | Tx hash, "sent to the network" |
| Failures | "Auto-renewed validators (Helicon upgrade) are not active on <network>". An owner address of another network or chain. Validator already registered. Period outside the allowed range. Invalid BLS signature. The max-three-nodes rule. |

The configuration can only be changed by the validator authority; this tool
supports a single-address authority with threshold 1.

---

## transaction setAutoRenewedValidatorConfig

Change the period of an auto-renewed validator, or stop its renewal.

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>` or `--validator-tx-id <txID>` (the id of the transaction that added the validator; it stays the same across renewals), `--period <seconds\|duration>` (new period from the next cycle on; `0` stops auto-renewal and returns the stake at the end of the current cycle), optional `--auto-compound-shares` |
| Side effects | Submits the configuration transaction, signed by the inputs' owner and by the validator authority (the same key in this tool). On the unsigned-file path the single signature in the signed file is used for both. |
| Output | Tx hash, "sent to the network" |
| Failures | Helicon not active. The node is not a current auto-renewed validator. The configured account is not in the validator authority. Period below the network minimum (other than 0). |

There is no way to exit before the end of the current cycle.

---

## send

Submit a previously-built signed transaction to the network.

| Aspect | Detail |
|---|---|
| Inputs | `-i <id>`: letters, digits, `.`, `_` and `-`, not starting with `.` (every command taking `-i` refuses other ids, which could name a file outside `ForDefiTxnFiles`) |
| Reads | `ForDefiTxnFiles/SignedTxns/<id>.signedTx.json` |
| Side effects | Submits the signed tx to the appropriate VM API and prints its id on stderr; sets `isSentToChain: true` in the JSON file as soon as the node takes the transaction (also when the wait for it then times out or fails), and removes it again when the chain refuses the transaction (P-chain `Aborted`/`Dropped`, C-chain `Dropped`), which may then be sent again |
| Output | "Transaction with hash ... sent to the node" |
| Failures | "Tx already sent to chain" (the flag was already set). A missing signed tx file, or one that is not JSON or lacks a field the tool reads (the error names the file and the field; files from earlier versions load, unknown fields included). A file whose `message` is not the hash of its transaction, or whose `unsignedTransactionBuffer` is not the transaction in its `serialization` ("… rebuild the file"), refused before anything is sent. The signature does not belong to the account the options select, in the order transactions use (`--get-hacked` with its `--env-path`, `--ledger`, `--env-path`, else the context file); `--get-hacked` without `--env-path` is refused, and so is a given `--ctx-file` that does not exist. |

Without `--ctx-file`, `ctx.json`, `--ledger` or `--env-path`, there is no account to check the signature against: `send` takes the account from the signature itself, so any validly signed file is sent, from whichever account signed it. It can't make a transaction from your account that you didn't sign. Keep a `ctx.json` (or pass `--ctx-file`) to have the signer checked.

`v` in the signature may be `00`/`01` or `1b`/`1c`. The signed tx file is produced by:
1. `transaction <op> -i <id>` (no `--ledger`/`--get-hacked`) writes
   `<id>.unsignedTx.json` with a message hash to sign. It refuses an id that
   already has an unsigned or a signed file: `send` reads only the signed
   file, so an old one left under the id would be sent instead
2. External signer (Ledger, ForDefi, manual) signs the message hash
3. Caller writes the signature into `<id>.signedTx.json`
4. `send -i <id>` submits

Co-signers who rebuild the transaction with the same command get the same
hash only while the account's P-chain UTXOs are the same: the inputs are the
UTXOs the node reports at build time, so funds arriving or leaving in between
(a stake ending, a transfer) change the transaction. Rebuild and compare again
in that case. Unsigned files treat every time-locked UTXO as still locked, even
once the lock has passed, so a lock ending between two builds doesn't change the
inputs. Such a UTXO isn't transferred, exported or used for a fee in an unsigned
file; once its lock has passed, use `--ledger` or `--get-hacked` for that. Stake
and delegate can still stake a stakeable-locked UTXO, and the stake keeps its
lock. Values left out of the
command are read from the chain as well (`--nonce`, `claim -a`, `exportPC -a`,
and the default `--gas-limit` of `claim`/`withdrawal`, which depends on whether
the recipient has contract code); passing them pins them.

---

## forDefi sign / fetch

Custodial signing flow via the ForDefi API.

| Aspect | Detail |
|---|---|
| Inputs | `forDefi sign -i <id>` or `forDefi fetch -i <id>`. Optional `--evm-tx`. |
| Reads | `private.pem` and `token` files in cwd, plus the unsigned tx JSON |
| Side effects | `sign`: posts the unsigned tx to ForDefi's API. `fetch`: asks ForDefi once for the signature and writes the signed tx file; it does not wait, so run it again until the transaction is signed. Fetching the same signature again leaves the signed file as it is; a new one (signed again in ForDefi) replaces it, unless the file was already sent. Files are rewritten through a temporary file, so an interrupted write never leaves half a file. |
| Output | `sign`: the ForDefi transaction id; `fetch`: the signature |
| Failures | Missing `private.pem` / `token`. A refused ForDefi request is reported with its HTTP status and answer (`ForDefi vault lookup (…) failed: HTTP 401 Unauthorized: …`), as is an answer that is not JSON. Vault id mismatch, or a context key that is not the vault's (compared as keys, so a compressed, uncompressed or `0x`-prefixed form of the same key is accepted). `sign` refuses a file whose `message` is not the hash of its transaction, or whose `unsignedTransactionBuffer` is not the transaction in its `serialization`, before contacting ForDefi: ForDefi signs only the hash. `fetch` before the signature exists: "Transaction is not signed yet (ForDefi state: …)"; a ForDefi answer that is not a JSON object, or a signature that is not 65 bytes of base64, is refused. |

Not exercised in the integration tests (requires real ForDefi credentials).

---

## Gas limits of C-chain commands

Since the Helicon upgrade (go-flare v1.15.1, ACP-194) the C-chain charges every
transaction for at least half of its gas limit, even when it uses less, so the
defaults below are sized close to the gas each call uses. `claim` and
`withdrawal` to an address with contract code (a smart contract wallet, a
Personal Delegation Account) get the larger limits of 4.4.0; the tool asks the
node whether the recipient has code. `--gas-limit` overrides every default;
every ForDefi signer of a transaction must pass the same value.
`setClaimExecutors` and `setAllowedClaimRecipients` use
`max(1,000,000, 150,000 + 75,000 per address)`, which guarantees that a stored
list of up to 50 addresses can be cleared. A signed file keeps the gas limit it
was built with; rebuild and re-sign files from earlier versions to get the
lower limits.

---

## withdrawal

Transfer FLR from the configured C-chain address to another address.

| Aspect | Detail |
|---|---|
| Inputs | `-t <address>`, `-a <amount>` (FLR), optional `--nonce`, optional `--gas-limit` (default 100,000, or 500,000 to an address with contract code) |
| Side effects | With `--get-hacked` or `--ledger`: sends the EVM tx and waits for the receipt. Otherwise writes the unsigned EVM tx file for `send -i`. |
| Output | Tx hash, or the ForDefi hash of the unsigned file |
| Failures | Insufficient C-balance. Invalid (badly checksummed) address. |

---

## claim

Claim accrued staking rewards from the ValidatorRewardManager contract.

| Aspect | Detail |
|---|---|
| Inputs | `-r <recipient>`, `-a <amount>` (default = full unclaimed), `--wrap` (default false), optional `--gas-limit` (default 200,000, or 600,000 with `--wrap` or to an address with contract code) |
| Side effects | With `--get-hacked` or `--ledger`: sends the EVM tx and waits for the receipt. Otherwise writes the unsigned EVM tx file for `send -i`. |
| Output | Tx hash, or the ForDefi hash of the unsigned file |
| Failures | No unclaimed rewards. Amount > unclaimed rewards. Contract not deployed on the network. |

---

## setClaimExecutors

Set the list of addresses authorized to call `claim` on behalf of the
configured C-chain address (ClaimSetupManager contract).

| Aspect | Detail |
|---|---|
| Inputs | `--executors <address...>`, required: the whole new list. `--executors ""` removes every executor. |
| Side effects | Builds the EVM tx (value = sum of the executors' fees); signed and sent with `--get-hacked`/`--ledger`, otherwise written as an unsigned file for `send -i` |
| Output | Tx hash, or the ForDefi hash of the unsigned file |
| Failures | `--executors` missing. An executor in the list is not registered on-chain. More than 50 addresses. Insufficient C-balance for the fee. |

---

## setAllowedClaimRecipients

Set the list of addresses allowed to receive claimed rewards (ClaimSetupManager
contract).

| Aspect | Detail |
|---|---|
| Inputs | `--recipients <address...>`, required: the whole new list. `--recipients ""` removes every recipient. |
| Side effects | Builds the EVM tx; signed and sent with `--get-hacked`/`--ledger`, otherwise written as an unsigned file for `send -i` |
| Output | Tx hash, or the ForDefi hash of the unsigned file |
| Failures | `--recipients` missing. More than 50 addresses. Insufficient C-balance. Contract not deployed. |

---

## customCChainTx

Submit an arbitrary C-chain transaction (low-level escape hatch).

| Aspect | Detail |
|---|---|
| Inputs | `--to <address>`, `--value <wei>`, `--data <hex>`, optional `--nonce`, optional `--gas-limit` (default 300,000; size it to the call) |
| Side effects | Builds the EVM tx; signed and sent with `--get-hacked`/`--ledger`, otherwise written as an unsigned file for `send -i` |
| Output | Tx hash, or the ForDefi hash of the unsigned file |
| Failures | Standard EVM failure modes (insufficient balance, gas, revert). |

---

## interactive

Menu-driven CLI using `inquirer`. Builds the same requests as the commands
above and runs them through the same pipeline, so semantics match the direct
CLI. Amounts are entered in FLR, times as unix seconds or durations. The node
is chosen as for the other commands (`--rpc-url`, `--api-key` or the
environment variables), the network from the menu. The C-chain fee prompt of
an export or import offers the fee estimated at twice the current base fee,
as `-f` omitted does, so Enter pays the fee shown. A fee typed in instead is
paid exactly; one below the cost at the current base fee is sent only after a
warning and a confirmation. When the fee cannot be estimated
yet (nothing to import yet), an empty answer is estimated when the transaction
is built. Invalid input (amounts, fees, periods, BLS keys) is refused at the
prompt, which asks again. `--gas-limit`, `--max-fee-per-gas` and
`--priority-fee-per-gas` given with `interactive` apply to its C-chain
transactions (`claim`). Its options are checked before anything starts, the
node URL (`--rpc-url` or `FLARE_RPC_URL`) included: `interactive --help` (or
`-i --help`) prints its help, and an unknown option or a bad value is refused
with exit code 1. The menu asks for the wallet and the network, so
`--network`, `--ledger`, `--blind`, `--derivation-path`, `--ctx-file`,
`--env-path` and `--get-hacked` are refused rather than ignored; a Ledger
context is kept in `./ctx.json`. The wallet menu has a Quit entry, so a wallet
that fails to connect can be left. It needs a terminal: with stdin redirected
or piped it refuses to start, with an error and exit code 1.

| Aspect | Detail |
|---|---|
| Inputs | stdin (a terminal) |
| Side effects | Interactive prompts; ultimately calls the same action handlers. Connecting a Ledger writes `ctx.json`; an existing non-Ledger `ctx.json` (e.g. a ForDefi one) is replaced only after confirmation, and every replaced file is kept as `ctx.json.<time>.bak`. A Ledger `ctx.json` is reused only when the connected device has its key at its derivation path; otherwise the tool names both addresses and offers to replace it. The session starts only when the device has the key of the chosen address (the one saved in `ctx.json`), and another Ledger plugged in during the session is refused at the next transaction, which is neither built nor signed |
| Output | Same as the underlying commands |
| Failures | Same as the underlying commands; exit code 1 without a terminal |

Tested via `node-pty` in `test/integration/cli-interactive.test.ts` (balance check
and stake flows).
