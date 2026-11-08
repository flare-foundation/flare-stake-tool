/**
 * Command options to typed transaction requests. The option types describe
 * what Commander delivers for each command (strings, string lists for
 * repeatable flags, booleans for switches) but Commander does not check them,
 * so the parsers check every value they use. Everything leaves as bigint or
 * integers.
 */
import {
  SHARES_PER_PERCENT,
  asWei,
  parseDuration,
  parseFlr,
  parseFlrToWei,
  parsePercentToShares,
  type NFlr,
} from "../chain/units";
import { normalizeAddressList, resolveEvmFees, type EvmFeeOverrides, type EvmOperation } from "../constants/fees";
import type { TxRequest } from "../core/types";
import {
  DEFAULT_DELEGATION_FEE_PERCENT,
  END_TIME,
  START_TIME,
  optionValue,
  optionalString,
  parseBlsHex,
  parseNodeId,
  parseNonce,
  parseTime,
  type ParsedTime,
} from "./inputs";

/** Options of `transaction <type>`. */
export interface AtomicTxOptions {
  amount?: string;
  fee?: string;
  nodeId?: string;
  startTime?: string;
  endTime?: string;
  nonce?: string;
  delegationFee?: string;
  popBlsPublicKey?: string;
  popBlsSignature?: string;
  transferAddress?: string;
  period?: string;
  autoCompoundShares?: string;
  ownerAddress?: string[];
  validatorTxId?: string;
  threshold?: string;
}

/**
 * Options of the C-chain commands (`withdrawal`, `claim`, `setClaimExecutors`,
 * `setAllowedClaimRecipients`, `customCChainTx`), with the fee options.
 */
export interface EvmTxOptions extends EvmFeeOverrides {
  to?: string;
  amount?: string;
  recipient?: string;
  wrap?: boolean;
  executors?: string[];
  recipients?: string[];
  value?: string;
  data?: string;
  nonce?: string;
}

const required = (value: unknown, name: string, flag: string, type: string): string => {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required for ${type} transaction. Use ${flag} to specify the ${name}`);
  }
  return value;
};

/**
 * The list a setClaimExecutors / setAllowedClaimRecipients transaction stores. Required: an empty list clears the
 * stored one, so clearing takes an explicit empty string rather than a forgotten option.
 */
function storedList(value: string[] | undefined, flag: string, type: string): string[] {
  if (value === undefined) {
    throw new Error(`${flag} is required for ${type}; to clear the stored list, pass ${flag} ""`);
  }
  return normalizeAddressList(value);
}

function parseShares(value: unknown): number | undefined {
  const text = optionValue(value, "--auto-compound-shares");
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text) || Number(text) > 100 * SHARES_PER_PERCENT) {
    throw new Error("--auto-compound-shares must be an integer between 0 and 1000000 (millionths)");
  }
  return Number(text);
}

/**
 * The options of `transaction` each type reads (see parseAtomicTxRequest); `-i` and the compatibility `--threshold`
 * are taken by every type. Any other option given on the command line is refused: it was ignored, so `importCP -a 5`
 * imported everything pending and `exportPC -f 1` paid the usual fee, while the user believed the value was pinned.
 */
export const ATOMIC_TX_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  exportCP: ["--amount", "--fee", "--nonce"],
  importCP: [],
  exportPC: ["--amount"],
  importPC: ["--fee"],
  stake: [
    "--node-id",
    "--amount",
    "--start-time",
    "--end-time",
    "--delegation-fee",
    "--pop-bls-public-key",
    "--pop-bls-signature",
  ],
  delegate: ["--node-id", "--amount", "--start-time", "--end-time"],
  transfer: ["--amount", "--transfer-address"],
  addAutoRenewedValidator: [
    "--node-id",
    "--amount",
    "--period",
    "--delegation-fee",
    "--pop-bls-public-key",
    "--pop-bls-signature",
    "--owner-address",
    "--auto-compound-shares",
  ],
  setAutoRenewedValidatorConfig: ["--node-id", "--validator-tx-id", "--period", "--auto-compound-shares"],
};
const EVERY_ATOMIC_TX_TYPE = ["--transaction-id", "--threshold"];
const EVM_FEE_FLAGS = ["--max-fee-per-gas", "--priority-fee-per-gas", "--gas-limit"];

/**
 * Refuses the options given on the command line (`given`, long flags; defaults don't count) that `transaction <type>`
 * doesn't read, the C-chain gas options included. An unknown type is left to parseAtomicTxRequest.
 */
export function refuseUnusedOptions(type: string, given: readonly string[]): void {
  const reads = ATOMIC_TX_OPTIONS[type];
  if (reads === undefined) return;
  const unused = given.filter((flag) => !EVERY_ATOMIC_TX_TYPE.includes(flag) && !reads.includes(flag));
  if (unused.length === 0) return;
  const gas = unused.some((flag) => EVM_FEE_FLAGS.includes(flag))
    ? " (the C-chain gas options are for the C-chain commands; exportCP and importPC take --fee)"
    : "";
  throw new Error(
    `transaction ${type} doesn't use ${unused.join(", ")}; leave ${unused.length === 1 ? "it" : "them"} out${gas}`
  );
}

/**
 * The validator authority of an auto-renewed validator: one address, threshold 1, as the tool supports. Several made a
 * 1-of-N authority that any one of them controlled alone, whatever `--threshold` said.
 */
function ownerAddress(value: string[] | undefined): string | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length !== 1) {
    throw new Error(
      `--owner-address takes one address (the validator authority is a single address with threshold 1), got ${value.length}`
    );
  }
  return optionValue(value[0], "--owner-address");
}

/** Builds the typed request for `transaction <type>`; also reports end times that were resolved from durations. */
export function parseAtomicTxRequest(
  type: string,
  options: AtomicTxOptions
): { request: TxRequest; resolvedTimes: { name: string; time: ParsedTime }[] } {
  if (options.threshold !== undefined && options.threshold !== "1") {
    throw new Error("--threshold accepts only 1: the validator authority is a single address (--owner-address)");
  }
  const amount = (): NFlr => parseFlr(required(options.amount, "amount", "--amount <amount>", type));
  const optionalAmount = (): NFlr | undefined => {
    const text = optionValue(options.amount, "--amount");
    return text === undefined ? undefined : parseFlr(text);
  };
  const fee = (): NFlr | undefined => {
    const text = optionValue(options.fee, "--fee");
    return text === undefined ? undefined : parseFlr(text);
  };
  const nodeId = (): string => parseNodeId(required(options.nodeId, "nodeId", "--node-id <nodeId>", type));
  const resolvedTimes: { name: string; time: ParsedTime }[] = [];
  const endTime = (): bigint => {
    const time = parseTime(required(options.endTime, "endTime", "--end-time <endTime>", type));
    resolvedTimes.push({ name: END_TIME, time });
    return time.value;
  };
  const startTime = (): bigint | undefined => {
    const text = optionalString(options.startTime);
    if (text === undefined || text === "0") return undefined;
    const time = parseTime(text);
    resolvedTimes.push({ name: START_TIME, time });
    return time.value;
  };
  const shares = (): number =>
    parsePercentToShares(optionValue(options.delegationFee, "--delegation-fee") ?? DEFAULT_DELEGATION_FEE_PERCENT);
  const bls = () => ({
    blsPublicKey: parseBlsHex(
      required(options.popBlsPublicKey, "popBlsPublicKey", "--pop-bls-public-key <popBlsPublicKey>", type),
      "publicKey"
    ),
    blsSignature: parseBlsHex(
      required(options.popBlsSignature, "popBlsSignature", "--pop-bls-signature <popBlsSignature>", type),
      "signature"
    ),
  });
  const period = (): bigint => parseDuration(required(options.period, "period", "--period <seconds|duration>", type));

  let request: TxRequest;
  switch (type) {
    case "exportCP": {
      const nonce = parseNonce(options.nonce);
      request = { type, amount: amount(), fee: fee(), nonce: nonce === undefined ? undefined : BigInt(nonce) };
      break;
    }
    case "importCP":
      request = { type };
      break;
    case "exportPC":
      request = { type, amount: optionalAmount() };
      break;
    case "importPC":
      request = { type, fee: fee() };
      break;
    case "stake":
      request = {
        type,
        nodeId: nodeId(),
        amount: amount(),
        startTime: startTime(),
        endTime: endTime(),
        delegationFeeShares: shares(),
        ...bls(),
      };
      break;
    case "delegate":
      request = { type, nodeId: nodeId(), amount: amount(), startTime: startTime(), endTime: endTime() };
      break;
    case "transfer":
      request = {
        type,
        amount: amount(),
        to: required(options.transferAddress, "transferAddress", "--transfer-address <address>", type),
      };
      break;
    case "addAutoRenewedValidator":
      request = {
        type,
        nodeId: nodeId(),
        amount: amount(),
        period: period(),
        delegationFeeShares: shares(),
        ...bls(),
        ownerAddress: ownerAddress(options.ownerAddress),
        autoCompoundShares: parseShares(options.autoCompoundShares),
      };
      break;
    case "setAutoRenewedValidatorConfig": {
      const validatorTxId = optionalString(options.validatorTxId);
      const node = optionalString(options.nodeId);
      if (!validatorTxId && !node) {
        throw new Error(
          "setAutoRenewedValidatorConfig needs the validator: use --node-id <nodeId> or --validator-tx-id <txID>"
        );
      }
      request = {
        type,
        nodeId: node === undefined ? undefined : parseNodeId(node),
        validatorTxId,
        period: period(),
        autoCompoundShares: parseShares(options.autoCompoundShares),
      };
      break;
    }
    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }
  return { request, resolvedTimes };
}

export function parseEvmTxRequest(operation: EvmOperation, options: EvmTxOptions): TxRequest {
  const nonce = parseNonce(options.nonce);
  switch (operation) {
    case "withdrawal":
      return {
        type: "withdrawal",
        to: required(options.to, "to", "--to <address>", "withdrawal"),
        amount: parseFlrToWei(required(options.amount, "amount", "--amount <amount>", "withdrawal")),
        nonce,
        fees: resolveEvmFees("withdrawal", options),
      };
    case "claim": {
      const amount = optionValue(options.amount, "--amount");
      return {
        type: "claim",
        recipient: required(options.recipient, "recipient", "--recipient <address>", "claim"),
        amount: amount === undefined ? undefined : parseFlrToWei(amount),
        wrap: Boolean(options.wrap),
        nonce,
        fees: resolveEvmFees("claim", options),
      };
    }
    case "setClaimExecutors": {
      const executors = storedList(options.executors, "--executors", "setClaimExecutors");
      return {
        type: "setClaimExecutors",
        executors,
        nonce,
        fees: resolveEvmFees("setClaimExecutors", options, executors.length),
      };
    }
    case "setAllowedClaimRecipients": {
      const recipients = storedList(options.recipients, "--recipients", "setAllowedClaimRecipients");
      return {
        type: "setAllowedClaimRecipients",
        recipients,
        nonce,
        fees: resolveEvmFees("setAllowedClaimRecipients", options, recipients.length),
      };
    }
    case "custom": {
      const value = optionValue(options.value, "--value") ?? "0";
      if (!/^\d+$/.test(value)) {
        throw new Error("--value must be an integer amount of wei");
      }
      return {
        type: "customCChainTx",
        to: required(options.to, "to", "--to <address>", "customCChainTx"),
        value: asWei(BigInt(value)),
        data: optionValue(options.data, "--data") ?? "0x",
        nonce,
        fees: resolveEvmFees("custom", options),
      };
    }
  }
}
