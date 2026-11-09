/**
 * User inputs shared by the command line and interactive mode, parsed into
 * typed values. Units at this boundary: amounts in FLR, times in unix seconds
 * or durations, percentages as decimals. Nothing here talks to a node or a
 * signer.
 */
import { bls } from "@flarenetwork/flarejs";
import { getBytes } from "ethers";
import { decodeCb58 } from "../chain/keys";
import { isDurationInput, parseEndTime } from "../chain/units";
import { resolveEvmFees, type EvmFeeOverrides } from "../constants/fees";

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

/**
 * The value of an option whose absence means a default, or undefined when it is absent. An empty value is refused
 * rather than taken as absent: `claim -a "$AMT"` with AMT unset claimed every reward.
 */
export function optionValue(value: unknown, flag: string): string | undefined {
  if (value === "") {
    throw new Error(`Option ${flag} is empty; leave it out to use the default`);
  }
  return typeof value === "string" ? value : undefined;
}

/** Byte lengths of a BLS proof of possession: the compressed G1 public key and the G2 signature. */
const BLS_LENGTHS = { publicKey: 48, signature: 96 } as const;

/**
 * Parses the hex (0x optional) of a node's BLS public key or proof-of-possession
 * signature and checks its length and that it is a point of its curve group, for
 * the command line and the interactive menu: flarejs failed only at build time,
 * with "Cannot find square root".
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
  try {
    if (part === "publicKey") bls.publicKeyFromBytes(bytes);
    else bls.signatureFromBytes(bytes);
  } catch {
    throw new Error(`${label} is not a valid BLS ${part === "publicKey" ? "key" : "signature"}; ${COPY_FROM_NODE}`);
  }
  return bytes;
}

const COPY_FROM_NODE = "copy it from the node's info.getNodeID";

/**
 * Refuses a BLS signature that is not the proof of possession of the public key, as the P-chain does: a key and a
 * signature copied from two nodes were refused only by the node.
 */
export function checkProofOfPossession(publicKey: Uint8Array, signature: Uint8Array): void {
  if (!bls.verifyProofOfPossession(bls.publicKeyFromBytes(publicKey), bls.signatureFromBytes(signature), publicKey)) {
    throw new Error(
      "The BLS signature (--pop-bls-signature) is not the proof of possession of the BLS public key " +
        "(--pop-bls-public-key); copy both from the same node's info.getNodeID"
    );
  }
}

const NODE_ID_PREFIX = "NodeID-";
const NODE_ID_BYTES = 20;

/**
 * Checks a node id ("NodeID-" and the CB58 of 20 bytes), for the command line and the interactive menu, and returns
 * it trimmed. Its checksum is checked here because flarejs doesn't: a mistyped id would stake to a node nobody runs.
 */
export function parseNodeId(value: string): string {
  const label = "Node ID (--node-id)";
  const text = value.trim();
  if (!text.startsWith(NODE_ID_PREFIX)) {
    throw new Error(`${label} must start with "${NODE_ID_PREFIX}", got "${text}"`);
  }
  const bytes = decodeCb58(text.slice(NODE_ID_PREFIX.length), label);
  if (bytes.length !== NODE_ID_BYTES) {
    throw new Error(`${label} must be ${NODE_ID_BYTES} bytes, got ${bytes.length}`);
  }
  return text;
}

/** `--nonce`: a non-negative integer, or undefined when not given. */
export function parseNonce(value: unknown): number | undefined {
  const text = optionValue(value, "--nonce");
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

/** Unix seconds from this value on are past the year 5138: such a time was almost certainly given in milliseconds. */
const MILLISECONDS_FROM = 100_000_000_000n;

/**
 * A warning for an absolute time that looks like milliseconds: `-e 1700000000000` is taken as seconds, a date some
 * 54,000 years away. The value is not changed, and a duration is never such a time.
 */
export function millisecondsWarning(name: string, time: ParsedTime): string | undefined {
  if (time.relative || time.value < MILLISECONDS_FROM) return undefined;
  const year = new Date(Number(time.value) * 1000).getUTCFullYear();
  return (
    `${name} ${time.value} looks like milliseconds: as unix seconds it is in the year ${year}; ` +
    `in seconds it would be ${time.value / 1000n}`
  );
}

/** The warnings for an end time, on the command line and in interactive mode: milliseconds, or not in the future. */
export function endTimeWarnings(time: ParsedTime, nowMs: number = Date.now()): string[] {
  return [millisecondsWarning(END_TIME, time), pastEndTimeWarning(time.value, nowMs)].filter(
    (warning): warning is string => warning !== undefined
  );
}

/**
 * The C-chain fee options given with `interactive`. Validated here, so that a
 * bad value stops the session before it starts rather than at its first
 * C-chain transaction.
 */
export function evmFeeOverrides(options: EvmFeeOverrides): EvmFeeOverrides {
  const overrides = {
    maxFeePerGas: options.maxFeePerGas,
    priorityFeePerGas: options.priorityFeePerGas,
    gasLimit: options.gasLimit,
  };
  resolveEvmFees("custom", overrides);
  return overrides;
}
