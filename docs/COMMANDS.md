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
| `--ledger` | Sign transactions on a connected Ledger device |
| `--blind` | Blind signing on Ledger (default true) |
| `--derivation-path <path>` | Ledger derivation path (default `m/44'/60'/0'/0/0`) |
| `--ctx-file <file>` | Context file path (default `ctx.json`) |
| `--env-path <path>` | `.env` file containing `PRIVATE_KEY_HEX` and/or `PRIVATE_KEY_CB58` |
| `--get-hacked` | Use the env file's private key for direct in-process signing |

`-a`/`-f` (amount/fee) are in **FLR**. `getOptions()` multiplies by 1e9 to
convert to nFLR before the action runs.

---

## init-ctx

Create a `ctx.json` file describing how to operate the tool for subsequent
commands.

| Aspect | Detail |
|---|---|
| Inputs | One of: `-p <publicKey>`, `--ledger`, `--get-hacked --env-path <file>`. `--network <name>`. |
| Side effects | Writes `ctx.json` in the current working directory |
| Output | Success message |
| Failures | Throws if `ctx.json` already exists |

The resulting file contains the public key, derived addresses, and the
network. It does **not** contain the private key.

---

## info \<addresses\|balance\|network\|validators\>

Read-only queries against the configured network. Requires either a
context file (`--ctx-file ctx.json`), `--ledger`, or
`--get-hacked --env-path`.

### info addresses

Output the C-chain hex address, P-chain bech32 address, and compressed
secp256k1 public key derived from the configured key/context.

### info balance

Output the C-chain (in wei → display as FLR with 18 decimals) and P-chain
(in nFLR → display as FLR with 9 decimals) balances for the configured
addresses.

### info network

Output the configured network name and its key parameters (network ID, HRP,
chain ID, RPC URL).

### info validators

Output the list of current validators on the P-chain. Each entry includes
nodeID, weight, start/end times, reward owner, delegators.

---

## transaction exportCP

Move FLR from the C-chain to the P-chain (atomic export step).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>` (FLR, required), `-f <fee>` (FLR, optional — defaults to network base fee) |
| Side effects | Submits an atomic export tx on the C-chain; UTXO appears on P-chain after a delay |
| Output | Tx hash, "sent to the network" |
| Failures | "insufficient funds" if C-chain balance < amount + fee. Network parse errors if amount serialization changes between go-flare versions. |

**Always followed by** `transaction importCP` to claim the UTXO on the P-chain.

---

## transaction importCP

Complete the C→P transfer started by `exportCP`. Reads pending UTXOs from
the C-chain source.

| Aspect | Detail |
|---|---|
| Inputs | None (uses configured key/context) |
| Side effects | Submits an atomic import tx on the P-chain |
| Output | Tx hash, "sent to the network" |
| Failures | "no UTXOs available to import" if the export hasn't propagated yet (wait a few seconds) |

---

## transaction exportPC

Move FLR from the P-chain to the C-chain (reverse of exportCP).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>` (FLR, optional — defaults to entire P-chain balance minus fee) |
| Side effects | Submits an atomic export tx on the P-chain |
| Output | Tx hash, "sent to the network" |
| Failures | "Export amount is smaller than or equal to zero" if P-balance ≤ exportFee |

---

## transaction importPC

Complete the P→C transfer started by `exportPC`. Reads pending UTXOs.

| Aspect | Detail |
|---|---|
| Inputs | `-f <fee>` (FLR, optional). |
| Side effects | Submits an atomic import tx on the C-chain |
| Output | Tx hash, "sent to the network" |
| Failures | "tx has no imported inputs" if exportPC hasn't propagated to the C-chain atomic mempool yet (3s delay typically suffices on local) |

---

## transaction stake

Register a new permissionless validator using locked P-chain funds.

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>`, `-a <amount>` (≥10,000 FLR), `-e <endTime>` (unix seconds), `--delegation-fee <pct>` (default 20), `--pop-bls-public-key <hex>`, `--pop-bls-signature <hex>`, optional `-s <startTime>` |
| Side effects | Locks the staked amount on the P-chain for the duration. Funds return to the staking address on `endTime`. |
| Output | Tx hash, "sent to the network" |
| Failures | "Insufficient funds" if P-balance < stake amount. Validator already registered. Invalid BLS signature. End time before start time or after the configured maximum. |

`startTime` defaults to current time + small offset. `pop-bls-*` come from
the running node (`info.getNodeID` JSON-RPC).

---

## transaction delegate

Delegate P-chain funds to an existing validator.

| Aspect | Detail |
|---|---|
| Inputs | `-n <nodeId>`, `-a <amount>` (≥10,000 FLR), `-e <endTime>`, optional `-s <startTime>` |
| Side effects | Locks the delegated amount until endTime; rewards accrue per the validator's delegation fee |
| Output | Tx hash, "sent to the network" |
| Failures | Validator not found / not currently active. Insufficient P-chain funds. End time outside the validator's active window. |

---

## transaction transfer

Move FLR between two P-chain addresses (P → P).

| Aspect | Detail |
|---|---|
| Inputs | `-a <amount>`, `--transfer-address <P-...>` |
| Side effects | Submits a P-chain base tx |
| Output | Tx hash, "sent to the network" |
| Failures | Invalid bech32 address. Insufficient P-chain funds. |

---

## send

Submit a previously-built signed transaction to the network.

| Aspect | Detail |
|---|---|
| Inputs | `-i <id>` |
| Reads | `ForDefiTxnFiles/SignedTxns/<id>.signedTx.json` |
| Side effects | Submits the signed tx to the appropriate VM API; sets `isSentToChain: true` in the JSON file |
| Output | "Transaction with hash ... sent to the node" |
| Failures | "Tx already sent to chain" (the flag was already set). Missing or malformed signed tx file. |

The signed tx file is produced by:
1. `transaction <op> -i <id>` (no `--ledger`/`--get-hacked`) writes
   `<id>.unsignedTx.json` with a message hash to sign
2. External signer (Ledger, ForDefi, manual) signs the message hash
3. Caller writes the signature into `<id>.signedTx.json`
4. `send -i <id>` submits

---

## forDefi sign / fetch

Custodial signing flow via the ForDefi API.

| Aspect | Detail |
|---|---|
| Inputs | `forDefi sign -i <id>` or `forDefi fetch -i <id>`. Optional `--evm-tx`. |
| Reads | `private.pem` and `token` files in cwd, plus the unsigned tx JSON |
| Side effects | `sign`: posts the unsigned tx to ForDefi's API. `fetch`: polls for the signature and writes the signed tx file. |
| Output | Tx hash sent to ForDefi; signature when fetched |
| Failures | Missing `private.pem` / `token`. ForDefi API auth/rate-limit errors. Vault id mismatch. |

Not exercised in the integration tests (requires real ForDefi credentials).

---

## withdrawal

Submit a C-chain transaction that withdraws FLR from a contract escrow.

| Aspect | Detail |
|---|---|
| Inputs | Recipient, amount, optional wrap flag |
| Side effects | Sends an EVM tx |
| Output | Tx hash |
| Failures | Insufficient C-balance. Contract revert. |

---

## claim

Claim accrued staking rewards from the ValidatorRewardManager contract.

| Aspect | Detail |
|---|---|
| Inputs | `-r <recipient>`, `-a <amount>` (default = full unclaimed), `--wrap` (default false) |
| Side effects | EVM tx that transfers earned FLR to the recipient |
| Output | Tx hash |
| Failures | No unclaimed rewards. Amount > unclaimed rewards. Contract not deployed. |

---

## setClaimExecutors

Set the list of addresses authorized to call `claim` on behalf of the
configured C-chain address (ClaimSetupManager contract).

| Aspect | Detail |
|---|---|
| Inputs | List of executor addresses |
| Side effects | EVM tx that updates the executors mapping; pays an executor-registration fee |
| Output | Tx hash |
| Failures | An executor in the list is not registered on-chain. Insufficient C-balance for the fee. |

---

## setAllowedClaimRecipients

Set the list of addresses allowed to receive claimed rewards (ClaimSetupManager
contract).

| Aspect | Detail |
|---|---|
| Inputs | List of recipient addresses |
| Side effects | EVM tx |
| Output | Tx hash |
| Failures | Insufficient C-balance. Contract not deployed. |

---

## customCChainTx

Submit an arbitrary C-chain transaction (low-level escape hatch).

| Aspect | Detail |
|---|---|
| Inputs | Recipient, value, raw data |
| Side effects | EVM tx |
| Output | Tx hash |
| Failures | Standard EVM failure modes (insufficient balance, gas, revert). |

---

## interactive

Menu-driven CLI using `inquirer`. Wraps the same commands above with prompts.
The prompts label amounts as "in FLR" and pass values through the same
`getOptions()` conversion, so semantics match the direct CLI.

| Aspect | Detail |
|---|---|
| Inputs | stdin |
| Side effects | Interactive prompts; ultimately calls the same action handlers |
| Output | Same as the underlying commands |
| Failures | Same as the underlying commands |

Tested via `node-pty` in `test/integration/cli-interactive.test.ts` (balance check
and stake flows).
