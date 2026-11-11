/**
 * The options every command shares, and what they select: the network
 * environment, the signer and the account. Command-specific options are
 * parsed in ./requests; values shared with interactive mode in ./inputs.
 */
import type { OptionValues } from "commander";
import type { Account } from "../chain/keys";
import type { Env, Signer } from "../core/types";
import {
  DEFAULT_CTX_FILE,
  accountFromContextFile,
  contextFileExists,
  createEnv,
  readContextFile,
  resolveNetworkName,
} from "../app/env";
import { ExternalFileSigner } from "../signers/file";
import { checkDerivationPath } from "../ledger/path";
import { LedgerSigner, ledgerDevice } from "../signers/ledger";
import { PrivateKeySigner } from "../signers/privateKey";
import { BASE_DERIVATION_PATH } from "./inputs";
import { nodeOverrides } from "./node";

export interface GlobalOptions {
  network?: string;
  rpcUrl?: string;
  apiKey?: string;
  ledger?: boolean;
  /** Only when given: without it, --ledger takes a Ledger context file's path, else BASE_DERIVATION_PATH. */
  derivationPath?: string;
  /** Only when given, and then it must exist; DEFAULT_CTX_FILE otherwise, used when it exists. */
  ctxFile?: string;
  envPath?: string;
  getHacked?: boolean;
  maxFeePerGas?: string;
  priorityFeePerGas?: string;
  gasLimit?: string;
  transactionId?: string;
}

/** Merges the program-level options with a command's own; command options win. A non-string value counts as not given. */
export function globalOptions(programOptions: OptionValues): GlobalOptions;
export function globalOptions<T extends object>(programOptions: OptionValues, commandOptions: T): GlobalOptions & T;
export function globalOptions(programOptions: OptionValues, commandOptions: object = {}): GlobalOptions {
  const merged = { ...programOptions, ...commandOptions } as GlobalOptions;
  if (typeof merged.derivationPath !== "string") delete merged.derivationPath;
  if (typeof merged.ctxFile !== "string") delete merged.ctxFile;
  return merged;
}

/**
 * A context file given with --ctx-file must exist, for every command but init-ctx (which writes it), whatever else
 * selects the account or the network, and also where the command does not read it: a mistyped one is reported, not
 * ignored.
 */
export function requireGivenContextFile(options: GlobalOptions): void {
  if (options.ctxFile !== undefined && !contextFileExists(options.ctxFile)) {
    throw new Error(`Context file ${options.ctxFile} does not exist (given with --ctx-file)`);
  }
}

/** The environment of every command but init-ctx and forDefi, after requireGivenContextFile. */
export function resolveEnv(options: GlobalOptions): Env {
  requireGivenContextFile(options);
  return createEnv(resolveNetworkName(options.network, options.ctxFile), nodeOverrides(options));
}

/**
 * Which account the options select, in one order for every command: the key file with --get-hacked, the Ledger, a
 * key file, the context file. Transactions sign for it, and info and send report and check it, so a command never
 * shows one account and signs for another.
 */
type AccountSource = "keyFile" | "ledger" | "contextFile";

function accountSource(options: GlobalOptions): AccountSource {
  // refused before either is opened; the key file used to win silently
  if (options.getHacked && options.ledger) {
    throw new Error("--ledger and --get-hacked select different signers; pass one of them");
  }
  if (options.getHacked) return "keyFile";
  if (options.ledger) return "ledger";
  return options.envPath ? "keyFile" : "contextFile";
}

/** Whether the options select an account themselves (key file or Ledger) rather than leave it to the context file. */
export function selectsAccount(options: GlobalOptions): boolean {
  return accountSource(options) !== "contextFile";
}

function keyFileSigner(options: GlobalOptions, env: Env): PrivateKeySigner {
  if (!options.envPath) {
    throw new Error("--get-hacked requires --env-path <file> with PRIVATE_KEY_HEX or PRIVATE_KEY_CB58");
  }
  return PrivateKeySigner.fromEnvFile(options.envPath, env.network.hrp);
}

/** Whether a context file applies: one given with --ctx-file, which reading then requires, or ./ctx.json if there. */
export function contextFileApplies(options: GlobalOptions): boolean {
  return options.ctxFile !== undefined || contextFileExists(DEFAULT_CTX_FILE);
}

/**
 * The Ledger signer --ledger selects: at --derivation-path when given; else, with a Ledger context file, at its
 * derivation path and expecting its key, as interactive mode does, so that --ledger signs for the account the context
 * was made for; else at BASE_DERIVATION_PATH.
 */
function ledgerSigner(options: GlobalOptions, env: Env): LedgerSigner {
  if (options.derivationPath !== undefined) {
    const derivationPath = checkDerivationPath(options.derivationPath, "--derivation-path");
    return new LedgerSigner(ledgerDevice(), derivationPath, env.network.hrp);
  }
  const context = contextFileApplies(options) ? readContextFile(options.ctxFile) : undefined;
  if (context?.wallet === "ledger") {
    return new LedgerSigner(
      ledgerDevice(),
      context.derivationPath ?? BASE_DERIVATION_PATH,
      env.network.hrp,
      context.publicKey,
      `as saved in ${options.ctxFile ?? DEFAULT_CTX_FILE}; connect the Ledger it was made with, or pass --derivation-path`
    );
  }
  return new LedgerSigner(ledgerDevice(), BASE_DERIVATION_PATH, env.network.hrp);
}

/** Signs with the key file (--get-hacked) or the Ledger; otherwise writes an unsigned file for the selected account. */
export async function resolveSigner(options: GlobalOptions, env: Env): Promise<Signer> {
  const source = accountSource(options);
  if (source === "keyFile" && options.getHacked) {
    return keyFileSigner(options, env);
  }
  if (source === "ledger") {
    return ledgerSigner(options, env);
  }
  if (!options.transactionId) {
    throw new Error(
      "A transaction id is required for the unsigned-file flow: use -i <id>, or sign directly with --ledger or --get-hacked --env-path <file>"
    );
  }
  return new ExternalFileSigner(await resolveAccount(options, env), options.transactionId);
}

/** The account the options select (info commands, send's signature check): the one transactions sign for. */
export async function resolveAccount(options: GlobalOptions, env: Env): Promise<Account> {
  switch (accountSource(options)) {
    case "keyFile":
      return keyFileSigner(options, env).account();
    case "ledger":
      return ledgerSigner(options, env).account();
    case "contextFile":
      return accountFromContextFile(readContextFile(options.ctxFile), env.network.hrp);
  }
}
