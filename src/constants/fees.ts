const GWEI = 1_000_000_000;

/**
 * Fee parameters for C-chain EVM transactions.
 *
 * These are EIP-1559 (type 2) transactions, and the values are fixed constants
 * rather than estimated from the chain. A ForDefi transaction may be built
 * independently by several signers who all have to arrive at the same
 * transaction hash, so nothing in the signed payload may depend on chain state
 * at the moment it happens to be built.
 *
 * Type 2 is what makes a fixed fee workable. `maxFeePerGas` is a ceiling, not a
 * price: the transaction pays `baseFee + maxPriorityFeePerGas` at inclusion and
 * the unused part of the ceiling is never charged. A legacy transaction has no
 * such separation - its gas price is paid in full - so it cannot carry headroom
 * for a base fee spike without paying for that headroom on every call.
 */

/**
 * Ceiling per operation, never paid in full.
 *
 * The Flare C-chain base fee floor is 500 gwei, and reward-claiming rushes have
 * pushed it to 5420 gwei. 8000 gwei clears a spike well past the worst
 * observed, and is used for the operations that move funds, which may need to
 * land while one is happening.
 *
 * The ceiling is not entirely free: the sender's balance has to cover
 * `maxFeePerGas * gasLimit` before the transaction runs, even though the unused
 * remainder is never spent. The two commands that only rewrite a stored address
 * list can be rerun once a spike passes, so they reserve less; 4000 gwei is
 * still eight times the floor. Everything else, including a custom call whose
 * calldata and value the tool cannot interpret, gets the spike-proof ceiling.
 */
export const DEFAULT_MAX_FEE_PER_GAS = {
  claim: 8_000 * GWEI,
  withdrawal: 8_000 * GWEI,
  custom: 8_000 * GWEI,
  setClaimExecutors: 4_000 * GWEI,
  setAllowedClaimRecipients: 4_000 * GWEI,
} as const;

/**
 * Tip, paid in full on top of the base fee. Deliberately modest: Flare C-chain
 * blocks ran only 11-22% full even at the peak of the worst fee spike, so there
 * is no block-space competition to bid against, and the tip has no bearing on
 * whether a transaction clears the base fee floor.
 */
export const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = 200 * GWEI;

/**
 * Operations whose gas cost does not depend on their arguments, sized against
 * gas they actually use. `claim` is measured: 1943 mainnet claims used at most
 * 397,738 gas. `withdrawal` sends value to an address the user picks, which may
 * be a contract that does work on receipt, so it keeps more room than the
 * 21,000 a bare transfer needs.
 */
export const DEFAULT_GAS_LIMIT = {
  claim: 600_000,
  withdrawal: 500_000,
  // Arbitrary call supplied by the user, so no useful upper bound to assume.
  custom: 1_000_000,
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
 */
const LIST_GAS_FLOOR = 1_000_000;
const LIST_GAS_BASE = 150_000;
const LIST_GAS_PER_ENTRY = 75_000;

/** Longest address list this tool will write; see LIST_GAS_FLOOR. */
export const MAX_LIST_ENTRIES = 50;

export const LIST_OPERATIONS = ["setClaimExecutors", "setAllowedClaimRecipients"] as const;

export type EvmOperation = keyof typeof DEFAULT_MAX_FEE_PER_GAS;
export type ListOperation = (typeof LIST_OPERATIONS)[number];
export type FixedOperation = Exclude<EvmOperation, ListOperation>;

export interface EvmFees {
  type: 2;
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
  gasLimit: number;
}

export interface EvmFeeOverrides {
  maxFeePerGas?: unknown;
  priorityFeePerGas?: unknown;
  gasLimit?: unknown;
}

/**
 * @description Drops blank entries from an address list argument, which is how
 * the CLI expresses "remove all". The gas limit is sized from the list length,
 * so this has to run before sizing as well as before encoding, otherwise a
 * discarded blank changes the gas limit and the hash without changing the call.
 * @param addresses - raw list as supplied on the command line
 * @returns the list actually encoded into the transaction
 */
export function normalizeAddressList(addresses: string[] | undefined): string[] {
  return (addresses ?? []).filter((address) => address.trim() !== "");
}

/**
 * @description Gas limit for an operation that writes a list of addresses.
 * @param entries - number of addresses being set; zero clears the stored list
 * @returns the gas limit to place into the transaction
 */
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
 * @description Rejects a list longer than this tool can guarantee it can later
 * clear within the default gas limit. Setting a list replaces it rather than
 * appending, so a longer list cannot be built up in several calls, and
 * `--gas-limit` deliberately does not lift the bound: raising the limit for one
 * call would leave a stored list that a later clear, sized from the default
 * floor, could not be relied on to remove.
 * @param entries - number of addresses being set
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
 * @description Resolves the fee parameters for a C-chain operation, applying any
 * user overrides. Signers of the same ForDefi transaction have to pass identical
 * overrides, otherwise they produce differing transaction hashes.
 * @param operation - the operation being built, which selects the defaults
 * @param overrides - raw option values; the two fee fields are in gwei
 * @param entries - length of the address list, for the operations that set one
 * @returns the fee fields to place into the transaction
 */
export function resolveEvmFees(operation: EvmOperation, overrides?: EvmFeeOverrides, entries?: number): EvmFees {
  if (_isListOperation(operation)) {
    // Independent of gas limit resolution below, which --gas-limit short-circuits.
    _validateListLength(entries ?? 0);
  }
  const maxFeePerGas = _gwei(overrides?.maxFeePerGas, "--max-fee-per-gas") ?? DEFAULT_MAX_FEE_PER_GAS[operation];
  const maxPriorityFeePerGas =
    _gwei(overrides?.priorityFeePerGas, "--priority-fee-per-gas") ?? DEFAULT_MAX_PRIORITY_FEE_PER_GAS;
  const gasLimit = _units(overrides?.gasLimit, "--gas-limit") ?? _defaultGasLimit(operation, entries);

  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error(
      `Priority fee per gas (${maxPriorityFeePerGas / GWEI} gwei) cannot exceed max fee per gas (${maxFeePerGas / GWEI} gwei)`
    );
  }
  return { type: 2, maxFeePerGas, maxPriorityFeePerGas, gasLimit };
}

function _defaultGasLimit(operation: EvmOperation, entries?: number): number {
  if (_isListOperation(operation)) {
    return listGasLimit(entries ?? 0);
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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Option ${option} must be a positive integer, got ${JSON.stringify(value) ?? typeof value}`);
  }
  return parsed;
}
