/**
 * Turns Commander option bags into typed requests, signers and environments.
 * Units at this boundary: `-a`/`-f` in FLR, times in unix seconds or durations,
 * percentages as decimals; everything leaves as bigint / integers.
 */
import type { OptionValues } from "commander";
import { getBytes } from "ethers";
import type { Account } from "../chain/keys";
import {
  isDurationInput,
  parseDuration,
  parseEndTime,
  parseFlr,
  parseFlrToWei,
  parsePercentToShares,
} from "../chain/units";
import { normalizeAddressList, resolveEvmFees, type EvmOperation } from "../constants/fees";
import type { Env, Signer, TxRequest } from "../core/types";
import { accountFromContextFile, createEnv, readContextFile, resolveNetworkName } from "../app/env";
import { ExternalFileSigner } from "../signers/file";
import { LedgerSigner, ledgerDevice } from "../signers/ledger";
import { PrivateKeySigner } from "../signers/privateKey";
import { nodeOverrides } from "./node";

export const BASE_DERIVATION_PATH = "m/44'/60'/0'/0/0";
export const DEFAULT_DELEGATION_FEE_PERCENT = "20";
/** Label of the end time among the resolved times reported to the user. */
export const END_TIME = "End time";

export interface GlobalOptions {
  network?: string;
  rpcUrl?: string;
  apiKey?: string;
  ledger?: boolean;
  derivationPath: string;
  ctxFile: string;
  envPath?: string;
  getHacked?: boolean;
  maxFeePerGas?: string;
  priorityFeePerGas?: string;
  gasLimit?: string;
  transactionId?: string;
}

/** Merges the program-level options with a command's own; command options win. */
export function globalOptions(
  programOptions: OptionValues,
  commandOptions: OptionValues = {}
): GlobalOptions & OptionValues {
  const merged = { ...programOptions, ...commandOptions } as GlobalOptions & OptionValues;
  merged.derivationPath = typeof merged.derivationPath === "string" ? merged.derivationPath : BASE_DERIVATION_PATH;
  merged.ctxFile = typeof merged.ctxFile === "string" ? merged.ctxFile : "ctx.json";
  return merged;
}

export function resolveEnv(options: GlobalOptions): Env {
  return createEnv(resolveNetworkName(options.network, options.ctxFile), nodeOverrides(options));
}

/** Private key → Ledger → external file, in that order of precedence (as before). */
export async function resolveSigner(options: GlobalOptions, env: Env): Promise<Signer> {
  if (options.getHacked) {
    if (!options.envPath) {
      throw new Error("--get-hacked requires --env-path <file> with PRIVATE_KEY_HEX or PRIVATE_KEY_CB58");
    }
    return PrivateKeySigner.fromEnvFile(options.envPath, env.network.hrp);
  }
  if (options.ledger) {
    return new LedgerSigner(ledgerDevice(), options.derivationPath, env.network.hrp);
  }
  if (!options.transactionId) {
    throw new Error(
      "A transaction id is required for the unsigned-file flow: use -i <id>, or sign directly with --ledger or --get-hacked --env-path <file>"
    );
  }
  const account = options.envPath
    ? await PrivateKeySigner.fromEnvFile(options.envPath, env.network.hrp).account()
    : accountFromContextFile(readContextFile(options.ctxFile), env.network.hrp);
  return new ExternalFileSigner(account, options.transactionId);
}

/** The account to report on (info commands): key file, Ledger or context file. */
export async function resolveAccount(options: GlobalOptions, env: Env): Promise<Account> {
  if (options.envPath) {
    return PrivateKeySigner.fromEnvFile(options.envPath, env.network.hrp).account();
  }
  if (options.ledger) {
    return new LedgerSigner(ledgerDevice(), options.derivationPath, env.network.hrp).account();
  }
  return accountFromContextFile(readContextFile(options.ctxFile), env.network.hrp);
}

const required = (value: unknown, name: string, flag: string, type: string): string => {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required for ${type} transaction. Use ${flag} to specify the ${name}`);
  }
  return value;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const hexBytes = (value: string, name: string): Uint8Array => {
  try {
    return getBytes(value.startsWith("0x") ? value : `0x${value}`);
  } catch {
    throw new Error(`${name} must be a hex string`);
  }
};

function parseShares(value: unknown): number | undefined {
  const text = optionalString(value);
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text) || Number(text) > 1_000_000) {
    throw new Error("--auto-compound-shares must be an integer between 0 and 1000000 (millionths)");
  }
  return Number(text);
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

/** Builds the typed request for `transaction <type>`; also reports end times that were resolved from durations. */
export function parseAtomicTxRequest(
  type: string,
  options: OptionValues
): { request: TxRequest; resolvedTimes: { name: string; time: ParsedTime }[] } {
  const amount = (): bigint => parseFlr(required(options["amount"], "amount", "--amount <amount>", type));
  const optionalAmount = (): bigint | undefined =>
    optionalString(options["amount"]) ? parseFlr(options["amount"] as string) : undefined;
  const fee = (): bigint | undefined =>
    optionalString(options["fee"]) ? parseFlr(options["fee"] as string) : undefined;
  const nodeId = (): string => required(options["nodeId"], "nodeId", "--node-id <nodeId>", type);
  const resolvedTimes: { name: string; time: ParsedTime }[] = [];
  const endTime = (): bigint => {
    const time = parseTime(required(options["endTime"], "endTime", "--end-time <endTime>", type));
    resolvedTimes.push({ name: END_TIME, time });
    return time.value;
  };
  const startTime = (): bigint | undefined => {
    const text = optionalString(options["startTime"]);
    if (text === undefined || text === "0") return undefined;
    const time = parseTime(text);
    resolvedTimes.push({ name: "Start time", time });
    return time.value;
  };
  const shares = (): number =>
    parsePercentToShares(optionalString(options["delegationFee"]) ?? DEFAULT_DELEGATION_FEE_PERCENT);
  const bls = () => ({
    blsPublicKey: hexBytes(
      required(options["popBlsPublicKey"], "popBlsPublicKey", "--pop-bls-public-key <popBlsPublicKey>", type),
      "--pop-bls-public-key"
    ),
    blsSignature: hexBytes(
      required(options["popBlsSignature"], "popBlsSignature", "--pop-bls-signature <popBlsSignature>", type),
      "--pop-bls-signature"
    ),
  });
  const period = (): bigint =>
    parseDuration(required(options["period"], "period", "--period <seconds|duration>", type));

  let request: TxRequest;
  switch (type) {
    case "exportCP": {
      const nonce = parseNonce(options["nonce"]);
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
        to: required(options["transferAddress"], "transferAddress", "--transfer-address <address>", type),
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
        ownerAddresses: Array.isArray(options["ownerAddress"]) ? (options["ownerAddress"] as string[]) : undefined,
        autoCompoundShares: parseShares(options["autoCompoundShares"]),
      };
      break;
    case "setAutoRenewedValidatorConfig": {
      const validatorTxId = optionalString(options["validatorTxId"]);
      const node = optionalString(options["nodeId"]);
      if (!validatorTxId && !node) {
        throw new Error(
          "setAutoRenewedValidatorConfig needs the validator: use --node-id <nodeId> or --validator-tx-id <txID>"
        );
      }
      request = {
        type,
        nodeId: node,
        validatorTxId,
        period: period(),
        autoCompoundShares: parseShares(options["autoCompoundShares"]),
      };
      break;
    }
    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }
  return { request, resolvedTimes };
}

export function parseEvmTxRequest(operation: EvmOperation, options: OptionValues): TxRequest {
  const nonce = parseNonce(options["nonce"]);
  switch (operation) {
    case "withdrawal":
      return {
        type: "withdrawal",
        to: required(options["to"], "to", "--to <address>", "withdrawal"),
        amount: parseFlrToWei(required(options["amount"], "amount", "--amount <amount>", "withdrawal")),
        nonce,
        fees: resolveEvmFees("withdrawal", options),
      };
    case "claim":
      return {
        type: "claim",
        recipient: required(options["recipient"], "recipient", "--recipient <address>", "claim"),
        amount: optionalString(options["amount"]) ? parseFlrToWei(options["amount"] as string) : undefined,
        wrap: Boolean(options["wrap"]),
        nonce,
        fees: resolveEvmFees("claim", options),
      };
    case "setClaimExecutors": {
      const executors = normalizeAddressList(options["executors"] as string[] | undefined);
      return {
        type: "setClaimExecutors",
        executors,
        nonce,
        fees: resolveEvmFees("setClaimExecutors", options, executors.length),
      };
    }
    case "setAllowedClaimRecipients": {
      const recipients = normalizeAddressList(options["recipients"] as string[] | undefined);
      return {
        type: "setAllowedClaimRecipients",
        recipients,
        nonce,
        fees: resolveEvmFees("setAllowedClaimRecipients", options, recipients.length),
      };
    }
    case "custom": {
      const value = optionalString(options["value"]) ?? "0";
      if (!/^\d+$/.test(value)) {
        throw new Error("--value must be an integer amount of wei");
      }
      return {
        type: "customCChainTx",
        to: required(options["to"], "to", "--to <address>", "customCChainTx"),
        value: BigInt(value),
        data: optionalString(options["data"]) ?? "0x",
        nonce,
        fees: resolveEvmFees("custom", options),
      };
    }
  }
}
