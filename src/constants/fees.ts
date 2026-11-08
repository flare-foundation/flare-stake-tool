const GWEI = 1_000_000_000;

/**
 * Fee parameters for C-chain EVM transactions.
 *
 * These are EIP-1559 (type 2) transactions, and the values are fixed constants
 * rather than estimated from the chain. A ForDefi transaction may be built
 * independently by several signers who all have to arrive at the same
 * transaction hash, so the fees may not depend on chain state at the moment it
 * happens to be built. The values that do come from the chain (the nonce, the
 * claim amount, the executor fees, the default gas limit of claim and
 * withdrawal) are printed or can be pinned with an option.
 *
 * Type 2 is what makes a fixed fee workable. `maxFeePerGas` is a cap, not a
 * price: the transaction pays `min(maxFeePerGas, baseFee + maxPriorityFeePerGas)`
 * per gas at inclusion, so while the base fee stays well below the cap the
 * headroom above it is not charged. A legacy transaction has no such separation
 * - its gas price is paid in full - so it cannot carry headroom for a base fee
 * spike without paying for that headroom on every call.
 */

/**
 * Cap per operation; paid in full only when the base fee comes within the tip
 * of it.
 *
 * The Flare C-chain base fee floor is 500 gwei, and reward-claiming rushes have
 * pushed it to 5420 gwei. 8000 gwei clears a spike well past the worst
 * observed, and is used for the operations that move funds, which may need to
 * land while one is happening.
 *
 * The cap is not entirely free: the sender's balance has to cover
 * `maxFeePerGas * gasLimit` before the transaction runs, even though only the
 * price actually charged is spent. The two commands that only rewrite a stored
 * address list can be rerun once a spike passes, so they reserve less; 4000
 * gwei is still eight times the floor. Everything else, including a custom call
 * whose calldata and value the tool cannot interpret, gets the spike-proof cap.
 */
export const DEFAULT_MAX_FEE_PER_GAS = {
  claim: 8_000 * GWEI,
  withdrawal: 8_000 * GWEI,
  custom: 8_000 * GWEI,
  setClaimExecutors: 4_000 * GWEI,
  setAllowedClaimRecipients: 4_000 * GWEI,
} as const;

/**
 * Maximum tip on top of the base fee (less when the base fee comes within it of
 * the cap). Deliberately modest: Flare C-chain blocks ran only 11-22% full even
 * at the peak of the worst fee spike, so there is no block-space competition to
 * bid against, and the tip has no bearing on whether a transaction clears the
 * base fee floor.
 */
export const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = 200 * GWEI;

/**
 * Gas limits of the operations whose cost does not depend on their arguments,
 * sized close to the gas they use: since the Helicon upgrade (ACP-194) the
 * C-chain charges every transaction at least half of its gas limit, whatever it
 * uses, so a limit far above the real use is paid for on every call.
 *
 * Measured with eth_estimateGas on Flare mainnet (2026-11), for a recipient
 * that is an ordinary account (no contract code):
 * - `claim` without wrapping: 77,533. The limit leaves room for a first claim
 *   (cold storage).
 * - `withdrawal`: 21,000.
 * - custom calls are arbitrary, so there is no bound to measure: the limit
 *   covers common contract calls, larger ones need `--gas-limit`.
 *
 * Wrapping and contract recipients get CLAIM_WRAP_GAS_LIMIT and
 * CONTRACT_RECIPIENT_GAS_LIMIT instead.
 */
export const DEFAULT_GAS_LIMIT = {
  claim: 200_000,
  withdrawal: 100_000,
  custom: 300_000,
} as const;

/**
 * `claim --wrap`: 263,465 measured; 1943 mainnet claims used at most 397,738
 * (wrapping into WNat updates vote power).
 */
export const CLAIM_WRAP_GAS_LIMIT = 600_000;

/**
 * `claim` and `withdrawal` to an address with contract code keep the limits of
 * 4.4.0: the recipient runs code on receipt, which can cost more than the call
 * itself. A Personal Delegation Account wraps what it receives into WNat (a
 * claim paid to one takes about 350,000 gas; a transfer to WNat itself 202,315).
 */
export const CONTRACT_RECIPIENT_GAS_LIMIT = {
  claim: 600_000,
  withdrawal: 500_000,
} as const;

/**
 * `setClaimExecutors` and `setAllowedClaimRecipients` replace a stored address
 * list, and neither the CLI nor the contract bounds its length, so a fixed
 * limit either wastes balance headroom on short lists or fails on long ones.
 *
 * The limit is therefore derived from the length of the list being set, which
 * is an explicit argument every signer passes, so it stays reproducible without
 * consulting the chain.
 *
 * Measured on mainnet: writing costs about 46k gas per recipient and 51k per
 * executor, on top of roughly 50-65k fixed. The per-entry allowance is well
 * above both, because setting a list also clears whatever was stored before,
 * and that part is not visible from the arguments. The floor carries that
 * clearing cost: on a mainnet fork, clearing a stored 50-address list took
 * 573,340 gas and replacing 50 addresses with 2 took 620,212, both inside the
 * floor.
 *
 * That is only sound while the stored list is itself bounded, since its length
 * is invisible here, so the list this tool will write is capped at a length
 * whose clearing cost the floor covers. Clearing scales at roughly 11k gas per
 * entry, so the floor carries about 85 entries - comfortably more than the cap.
 *
 * Since Helicon (ACP-194) at least half the limit is charged, so these calls
 * cost at least 500,000 gas even for a short list (setting one address takes
 * about 93k). They are rare setup calls, and the floor is what guarantees that a
 * stored list can be cleared, so it stays; `--gas-limit` lowers it.
 */
const LIST_GAS_FLOOR = 1_000_000;
const LIST_GAS_BASE = 150_000;
const LIST_GAS_PER_ENTRY = 75_000;

/** Longest address list this tool will write; see LIST_GAS_FLOOR. */
export const MAX_LIST_ENTRIES = 50;

export const LIST_OPERATIONS = ["setClaimExecutors", "setAllowedClaimRecipients"] as const;

export type EvmOperation = keyof typeof DEFAULT_MAX_FEE_PER_GAS;
export type ListOperation = (typeof LIST_OPERATIONS)[number];

export interface EvmFees {
  type: 2;
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
  /** `--gas-limit`; when undefined the builder uses `defaultGasLimit`, which may depend on the recipient. */
  gasLimit?: number | undefined;
}

/** What the default gas limit of an operation depends on. */
export interface EvmSizing {
  /** Length of the address list, for the operations that set one. */
  entries?: number | undefined;
  /** `claim --wrap`. */
  wrap?: boolean | undefined;
  /** The recipient of `claim` or `withdrawal` has contract code. */
  contractRecipient?: boolean | undefined;
}

export interface EvmFeeOverrides {
  maxFeePerGas?: unknown;
  priorityFeePerGas?: unknown;
  gasLimit?: unknown;
}

/**
 * Drops blank entries from an address list argument, which is how the CLI
 * expresses "remove all". The gas limit is sized from the list length, so this
 * has to run before sizing as well as before encoding, otherwise a discarded
 * blank changes the gas limit and the hash without changing the call.
 */
export function normalizeAddressList(addresses: string[] | undefined): string[] {
  return (addresses ?? []).filter((address) => address.trim() !== "");
}

/** Gas limit of an operation that sets a list of `entries` addresses (zero clears the stored list). */
export function listGasLimit(entries: number): number {
  if (!Number.isSafeInteger(entries) || entries < 0) {
    throw new Error(
      `Address list length must be a non-negative integer, got ${JSON.stringify(entries) ?? typeof entries}`
    );
  }
  _validateListLength(entries);
  return Math.max(LIST_GAS_FLOOR, LIST_GAS_BASE + entries * LIST_GAS_PER_ENTRY);
}

/**
 * Rejects a list longer than this tool can guarantee it can later clear within
 * the default gas limit. Setting a list replaces it rather than appending, so a
 * longer list cannot be built up in several calls, and `--gas-limit`
 * deliberately does not lift the bound: raising the limit for one call would
 * leave a stored list that a later clear, sized from the default floor, could
 * not be relied on to remove.
 */
function _validateListLength(entries: number): void {
  if (entries > MAX_LIST_ENTRIES) {
    throw new Error(
      `At most ${MAX_LIST_ENTRIES} addresses are supported, got ${entries}. ` +
        `A longer list could not be guaranteed to clear later within the default gas limit, ` +
        `and these calls replace the stored list rather than adding to it, so it cannot be set in parts.`
    );
  }
}

/**
 * The fee fields of a C-chain operation: its defaults, replaced by the user's
 * overrides (the two fees in gwei). Signers of the same ForDefi transaction have
 * to pass identical overrides, otherwise they produce differing transaction
 * hashes. The gas limit is set only when overridden; the builder otherwise uses
 * `defaultGasLimit`. `entries` is the length of the address list being set.
 */
export function resolveEvmFees(operation: EvmOperation, overrides?: EvmFeeOverrides, entries?: number): EvmFees {
  if (_isListOperation(operation)) {
    // Also with --gas-limit, which replaces the default gas limit.
    _validateListLength(entries ?? 0);
  }
  const maxFeePerGas = _gwei(overrides?.maxFeePerGas, "--max-fee-per-gas") ?? DEFAULT_MAX_FEE_PER_GAS[operation];
  const maxPriorityFeePerGas =
    _gwei(overrides?.priorityFeePerGas, "--priority-fee-per-gas") ?? DEFAULT_MAX_PRIORITY_FEE_PER_GAS;
  const gasLimit = _units(overrides?.gasLimit, "--gas-limit");

  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error(
      `Priority fee per gas (${maxPriorityFeePerGas / GWEI} gwei) cannot exceed max fee per gas (${maxFeePerGas / GWEI} gwei)`
    );
  }
  return { type: 2, maxFeePerGas, maxPriorityFeePerGas, gasLimit };
}

/** The gas limit of an operation when `--gas-limit` is not given. */
export function defaultGasLimit(operation: EvmOperation, sizing: EvmSizing = {}): number {
  if (_isListOperation(operation)) {
    return listGasLimit(sizing.entries ?? 0);
  }
  if (operation === "claim") {
    if (sizing.wrap) return CLAIM_WRAP_GAS_LIMIT;
    if (sizing.contractRecipient) return CONTRACT_RECIPIENT_GAS_LIMIT.claim;
  }
  if (operation === "withdrawal" && sizing.contractRecipient) {
    return CONTRACT_RECIPIENT_GAS_LIMIT.withdrawal;
  }
  return DEFAULT_GAS_LIMIT[operation];
}

function _isListOperation(operation: EvmOperation): operation is ListOperation {
  return (LIST_OPERATIONS as readonly string[]).includes(operation);
}

function _gwei(value: unknown, option: string): number | undefined {
  const gwei = _units(value, option);
  if (gwei === undefined) {
    return undefined;
  }
  const wei = gwei * GWEI;
  // Every fee field is written to the unsigned tx JSON as a number, so it has to
  // survive a JSON round trip exactly.
  if (!Number.isSafeInteger(wei)) {
    throw new Error(`Option ${option} is too large: ${gwei} gwei exceeds the largest exactly representable value`);
  }
  return wei;
}

function _units(value: unknown, option: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "") {
    throw new Error(`Option ${option} is empty; leave it out to use the default`);
  }
  // Plain digits, as for --nonce and -a: Number() alone would take 0x5208, 2.1e4 or +25.
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const parsed = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Option ${option} must be a positive integer, got ${JSON.stringify(value) ?? typeof value}`);
  }
  return parsed;
}
