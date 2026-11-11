/** Environment resolution and the ctx.json context file. */
import fs from "fs";
import path from "path";
import { createClients } from "../chain/clients";
import { accountFromPublicKey, type Account } from "../chain/keys";
import {
  DEFAULT_NETWORK,
  insecureApiKeyWarning,
  isNetworkName,
  networkConfig,
  type NodeOverrides,
} from "../chain/network";
import { logWarning } from "../output";
import type { Env } from "../core/types";
import { isJsonObject, parseJson } from "../core/json";

export const DEFAULT_CTX_FILE = "ctx.json";

/** Shape of ctx.json, written by `init-ctx`. `publicKey` is stored verbatim (ForDefi compares it with the vault's key). */
export interface ContextFile {
  wallet: "ledger" | "publicKey";
  publicKey: string;
  network: string;
  ethAddress?: string | undefined;
  flareAddress?: string | undefined;
  vaultId?: string | undefined;
  derivationPath?: string | undefined;
}

/** Nodes already warned about, so that a session reconnecting to one warns once. */
const warnedNodes = new Set<string>();

/**
 * The environment for a network name; `node` points it at a different node (see chain/network.ts). An API key that
 * would go over plain http to another machine is warned about on stderr, once per node, before any request.
 */
export function createEnv(network: string, node: NodeOverrides = {}): Env {
  const config = networkConfig(network, process.env, node);
  const warning = insecureApiKeyWarning(config);
  if (warning !== undefined && !warnedNodes.has(config.apiUrl)) {
    warnedNodes.add(config.apiUrl);
    logWarning(warning);
  }
  return { network: config, clients: createClients(config) };
}

export function readContextFile(file: string = DEFAULT_CTX_FILE): ContextFile {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Context file ${file} does not exist; run init-ctx first or pass --ledger / --get-hacked --env-path`
    );
  }
  // only the fields the tool reads are checked, and the object is returned as it was: older files carry other fields
  // (cached addresses, some with a C-chain address in flareAddress), which are kept and not relied on
  const parsed = parseJson(fs.readFileSync(file, "utf8"), `Context file ${file}`);
  if (!isJsonObject(parsed)) {
    throw new Error(`Context file ${file} is not a JSON object`);
  }
  if (typeof parsed["publicKey"] !== "string" || typeof parsed["network"] !== "string") {
    throw new Error(`Context file ${file} is missing publicKey or network`);
  }
  for (const field of ["wallet", "derivationPath", "vaultId"]) {
    if (parsed[field] !== undefined && typeof parsed[field] !== "string") {
      throw new Error(`Context file ${file} has a ${field} that is not a string`);
    }
  }
  return parsed as unknown as ContextFile;
}

export function contextFileExists(file: string = DEFAULT_CTX_FILE): boolean {
  return fs.existsSync(file);
}

/** Writes ctx.json, refusing to overwrite an existing one, even one that appeared since the check ("wx"). */
export function writeContextFile(context: ContextFile, file: string = DEFAULT_CTX_FILE): void {
  const exists = new Error(`${path.basename(file)} already exists`);
  if (fs.existsSync(file)) {
    throw exists;
  }
  try {
    fs.writeFileSync(file, JSON.stringify(context, null, 2), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw exists;
    throw error;
  }
}

/**
 * Moves an existing context file aside as `<file>.<timestamp>.bak` and returns
 * that path, so that replacing a context (a ForDefi one with its `vaultId`,
 * say) never loses it.
 */
export function backupContextFile(file: string = DEFAULT_CTX_FILE, now: Date = new Date()): string {
  const backup = `${file}.${now.toISOString().replace(/[:.]/g, "-")}.bak`;
  if (fs.existsSync(backup)) {
    throw new Error(`Backup ${backup} already exists`);
  }
  fs.renameSync(file, backup);
  return backup;
}

export function accountFromContextFile(context: ContextFile, hrp: string): Account {
  return accountFromPublicKey(context.publicKey, hrp);
}

/**
 * The network to act on: `--network` when given, else the network of the
 * context file when one exists, else flare.
 */
export function resolveNetworkName(explicit: string | undefined, ctxFile: string = DEFAULT_CTX_FILE): string {
  if (explicit !== undefined) {
    if (!isNetworkName(explicit)) {
      throw new Error(`Unknown network "${explicit}"`);
    }
    return explicit;
  }
  if (contextFileExists(ctxFile)) {
    return readContextFile(ctxFile).network;
  }
  return DEFAULT_NETWORK;
}
