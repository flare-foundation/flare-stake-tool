/**
 * User inputs shared by the command line and interactive mode, parsed into
 * typed values. Units at this boundary: amounts in FLR, times in unix seconds
 * or durations, percentages as decimals. Nothing here talks to a node or a
 * signer.
 */
import { getBytes } from "ethers";
import { isDurationInput, parseEndTime } from "../chain/units";
import { resolveEvmFees, type EvmFeeOverrides } from "../constants/fees";
import { argvValue } from "./node";

export const BASE_DERIVATION_PATH = "m/44'/60'/0'/0/0";
export const DEFAULT_DELEGATION_FEE_PERCENT = "20";
/** Labels of the end and start time among the resolved times reported to the user. */
export const END_TIME = "End time";
export const START_TIME = "Start time";

/**
 * Since Durango the chain starts a stake or delegation when it accepts the
 * transaction and does not use the start time written into it.
 */
export const START_TIME_NOT_USED_WARNING =
  "--start-time does not delay the stake: the network starts it when it accepts the transaction " +
  "(since the Durango upgrade), whatever start time the transaction carries";

/** An option's value, or undefined when it is absent or empty. */
export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** Byte lengths of a BLS proof of possession: the compressed G1 public key and the G2 signature. */
const BLS_LENGTHS = { publicKey: 48, signature: 96 } as const;

/**
 * Parses the hex (0x optional) of a node's BLS public key or proof-of-possession
 * signature and checks its length, for the command line and the interactive menu.
 */
export function parseBlsHex(value: string, part: keyof typeof BLS_LENGTHS): Uint8Array {
  const label = part === "publicKey" ? "BLS public key (--pop-bls-public-key)" : "BLS signature (--pop-bls-signature)";
  const text = value.trim();
  let bytes: Uint8Array;
  try {
    bytes = getBytes(text.startsWith("0x") ? text : `0x${text}`);
  } catch {
    throw new Error(`${label} must be a hex string`);
  }
  if (bytes.length !== BLS_LENGTHS[part]) {
    throw new Error(`${label} must be ${BLS_LENGTHS[part]} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** `--nonce`: a non-negative integer, or undefined when not given. */
export function parseNonce(value: unknown): number | undefined {
  const text = optionalString(value);
  if (text === undefined) return undefined;
  const nonce = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(nonce)) {
    throw new Error(`--nonce must be a non-negative integer, got "${text}"`);
  }
  return nonce;
}

/**
 * A warning for an end time that is not in the future, such as `-e 1209600`
 * meant as 14 days (a plain integer is a unix time). The network rejects it;
 * the command still runs so that the node gives the authoritative answer.
 */
export function pastEndTimeWarning(endTime: bigint, nowMs: number = Date.now()): string | undefined {
  if (endTime > BigInt(Math.floor(nowMs / 1000))) return undefined;
  return (
    `End time ${endTime} (${new Date(Number(endTime) * 1000).toISOString()}) is not in the future; ` +
    "a plain integer is a unix time, use a duration such as 14d for a period from now"
  );
}

export interface ParsedTime {
  value: bigint;
  /** True when the user gave a duration that was resolved against the clock. */
  relative: boolean;
}

export function parseTime(value: string): ParsedTime {
  return { value: parseEndTime(value), relative: isDurationInput(value) };
}

/**
 * The C-chain fee options from a raw argv, for `interactive`, which is
 * dispatched before Commander parses the command line. Validated here, so that
 * a bad value stops the session before it starts.
 */
export function evmFeeOverridesFromArgv(argv: readonly string[]): EvmFeeOverrides {
  const overrides = {
    maxFeePerGas: argvValue(argv, "--max-fee-per-gas"),
    priorityFeePerGas: argvValue(argv, "--priority-fee-per-gas"),
    gasLimit: argvValue(argv, "--gas-limit"),
  };
  resolveEvmFees("custom", overrides);
  return overrides;
}
