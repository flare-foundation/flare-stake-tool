/**
 * The options every command shares, and what they select: the network
 * environment, the signer and the account. Command-specific options are
 * parsed in ./requests; values shared with interactive mode in ./inputs.
 */
import type { OptionValues } from "commander";
import type { Account } from "../chain/keys";
import type { Env, Signer } from "../core/types";
import { accountFromContextFile, createEnv, readContextFile, resolveNetworkName } from "../app/env";
import { ExternalFileSigner } from "../signers/file";
import { LedgerSigner, ledgerDevice } from "../signers/ledger";
import { PrivateKeySigner } from "../signers/privateKey";
import { BASE_DERIVATION_PATH } from "./inputs";
import { nodeOverrides } from "./node";

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
export function globalOptions(programOptions: OptionValues): GlobalOptions;
export function globalOptions<T extends object>(programOptions: OptionValues, commandOptions: T): GlobalOptions & T;
export function globalOptions(programOptions: OptionValues, commandOptions: object = {}): GlobalOptions {
  const merged = { ...programOptions, ...commandOptions } as GlobalOptions;
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
