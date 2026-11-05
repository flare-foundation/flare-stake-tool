/**
 * Scenario execution shared by the recorder (live node behind the proxy) and the
 * golden tests (replay). A scenario is fully described by its spec, so the spec
 * stored in a golden file reproduces the run without the recorder's context.
 */
import fs from "fs";
import path from "path";
import { CLI_ENTRY, REPO_ROOT, runCli, runCliAsync, writeEnvFile } from "../helpers/cli";
import {
  EWOQ_PRIVATE_KEY_CB58,
  EWOQ_PRIVATE_KEY_HEX,
  EWOQ_PUBLIC_KEY_COMPRESSED,
  signMessageHash,
} from "../helpers/keys";
import type { Submission } from "./rpc-replay";

export const GOLDEN_DIR = path.join(REPO_ROOT, "test", "golden");
export const FIXTURE_DIR = path.join(REPO_ROOT, "test", "fixtures", "rpc");
const UNSIGNED_DIR = path.join("ForDefiTxnFiles", "UnsignedTxns");
const SIGNED_DIR = path.join("ForDefiTxnFiles", "SignedTxns");

export type ScenarioKind = "cli" | "ledger" | "send";

export interface ScenarioSpec {
  name: string;
  kind: ScenarioKind;
  /** CLI arguments (cli/send) or `[op, jsonParams]` for the ledger runner. */
  args: string[];
  /** Create ctx.json (public-key wallet) in the working directory first. */
  needsCtx?: boolean;
  /** Write test.env with the ewoq key in the working directory first. */
  needsEnv?: boolean;
  /** send only: name of the scenario whose unsigned tx file is signed and sent. */
  unsignedFrom?: string;
  /** send only: the unsigned file is an EVM transaction (message is the keccak hash). */
  evm?: boolean;
  /** Transaction id used for the unsigned/signed file names. */
  txFileId?: string;
  /**
   * Account to use instead of ewoq: a throwaway localflare key funded by the
   * recorder (scenarios whose checks depend on the account's existing stakes).
   */
  account?: ScenarioAccount;
}

export interface ScenarioAccount {
  privateKeyHex: string;
  publicKeyHex: string;
}

export interface ScenarioOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Hashes/ids printed by the CLI, in order of appearance. */
  txIds: string[];
  /** Content of the unsigned tx file written by the file path, if any. */
  unsignedTxJson?: unknown;
  submissions: Submission[];
}

export interface Golden {
  spec: ScenarioSpec;
  outcome: ScenarioOutcome;
}

export function goldenPath(name: string): string {
  return path.join(GOLDEN_DIR, `${name}.json`);
}

export function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, `${name}.json`);
}

export function readGolden(name: string): Golden {
  return JSON.parse(fs.readFileSync(goldenPath(name), "utf8")) as Golden;
}

/** UPDATE_GOLDENS=name1,name2 (or "all") rewrites those goldens from the current code. */
export function updateRequested(name: string): boolean {
  const requested = (process.env["UPDATE_GOLDENS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return requested.includes("all") || requested.includes(name);
}

export function listGoldens(): string[] {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

// Base58 tx ids (P/C atomic) or 0x hashes (EVM); the base64 ForDefi hash is excluded by the lookahead.
const TX_ID_RE = /(?:hash|id)\s*:?\s*([1-9A-HJ-NP-Za-km-z]{40,60}|0x[0-9a-fA-F]{64})(?![A-Za-z0-9+/=])/g;

export function extractTxIds(stdout: string): string[] {
  const ids: string[] = [];
  for (const match of stdout.matchAll(TX_ID_RE)) {
    ids.push(match[1]!);
  }
  return ids;
}

function prepareCwd(spec: ScenarioSpec, cwd: string): void {
  if (spec.needsEnv) {
    if (spec.account) writeEnvFile(cwd, spec.account.privateKeyHex);
    else writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX, EWOQ_PRIVATE_KEY_CB58);
  }
  if (spec.needsCtx) {
    const publicKey = spec.account?.publicKeyHex ?? EWOQ_PUBLIC_KEY_COMPRESSED;
    const init = runCli(["init-ctx", "-p", publicKey, "--network", "localflare"], { cwd });
    if (init.exitCode !== 0) {
      throw new Error(`init-ctx failed: ${init.stderr}`);
    }
  }
}

function readUnsignedFile(cwd: string, id: string): unknown {
  const file = path.join(cwd, UNSIGNED_DIR, `${id}.unsignedTx.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as unknown) : undefined;
}

/** For `send` scenarios: recreate the producer's unsigned file and the externally signed file. */
function writeSignedFiles(spec: ScenarioSpec, cwd: string, unsignedTxJson: unknown): void {
  if (!spec.txFileId) throw new Error(`send scenario ${spec.name} needs txFileId`);
  const unsigned = unsignedTxJson as { message?: string; signatureRequests?: { message: string }[] };
  const message = spec.evm ? unsigned.message : unsigned.signatureRequests?.[0]?.message;
  if (!message) throw new Error(`no message hash in unsigned tx of ${spec.unsignedFrom}`);
  fs.mkdirSync(path.join(cwd, UNSIGNED_DIR), { recursive: true });
  fs.mkdirSync(path.join(cwd, SIGNED_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, UNSIGNED_DIR, `${spec.txFileId}.unsignedTx.json`),
    JSON.stringify(unsignedTxJson, null, 2)
  );
  const signed = {
    ...(unsignedTxJson as object),
    signature: signMessageHash(message, spec.account?.privateKeyHex ?? EWOQ_PRIVATE_KEY_HEX),
  };
  fs.writeFileSync(path.join(cwd, SIGNED_DIR, `${spec.txFileId}.signedTx.json`), JSON.stringify(signed, null, 2));
}

/** Translates a recorded ledger scenario (`[op, jsonParams]`, amounts in FLR) into CLI arguments. */
export function ledgerCliArgs(spec: ScenarioSpec): string[] {
  const [op, json] = spec.args;
  const params = JSON.parse(json ?? "{}") as Record<string, string>;
  const flags: Record<string, string> = {
    amount: "-a",
    fee: "-f",
    nodeId: "-n",
    startTime: "-s",
    endTime: "-e",
    delegationFee: "--delegation-fee",
    popBlsPublicKey: "--pop-bls-public-key",
    popBlsSignature: "--pop-bls-signature",
    transferAddress: "--transfer-address",
  };
  const args = ["transaction", op ?? ""];
  for (const [key, value] of Object.entries(params)) {
    const flag = flags[key];
    if (flag && value !== undefined && value !== "") args.push(flag, value);
  }
  return [...args, "--ledger", "--network", "localflare"];
}

export interface RunContext {
  cwd: string;
  rpcUrl: string;
  /** Resolves the unsigned tx JSON produced by another scenario (for `send`). */
  unsignedFor: (scenarioName: string) => unknown;
  /** Submissions captured by the proxy during this run (read after the run). */
  submissions: () => Submission[];
}

export async function runScenario(spec: ScenarioSpec, ctx: RunContext): Promise<ScenarioOutcome> {
  prepareCwd(spec, ctx.cwd);
  const env = { FLARE_RPC_URL: ctx.rpcUrl, NO_COLOR: "1", FORCE_COLOR: "0" };
  const before = ctx.submissions().length;

  if (spec.kind === "ledger") {
    // Recorded with the legacy in-process Ledger path; replayed through the CLI with a
    // software "device" that signs hashes like the Flare app (FLARE_FAKE_LEDGER_KEY).
    const result = await runCliAsync(ledgerCliArgs(spec), {
      cwd: ctx.cwd,
      env: { ...env, FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
      timeoutMs: 120_000,
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      txIds: extractTxIds(result.stdout),
      submissions: ctx.submissions().slice(before),
    };
  }

  if (spec.kind === "send") {
    if (!spec.unsignedFrom) throw new Error(`send scenario ${spec.name} needs unsignedFrom`);
    writeSignedFiles(spec, ctx.cwd, ctx.unsignedFor(spec.unsignedFrom));
  }

  const result = await runCliAsync(spec.args, { cwd: ctx.cwd, env, timeoutMs: 120_000 });
  const outcome: ScenarioOutcome = {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    txIds: extractTxIds(result.stdout),
    submissions: ctx.submissions().slice(before),
  };
  if (spec.txFileId && spec.kind === "cli") {
    const unsigned = readUnsignedFile(ctx.cwd, spec.txFileId);
    if (unsigned !== undefined) outcome.unsignedTxJson = unsigned;
  }
  return outcome;
}

/** The fields of an outcome that must be identical between runs: everything the command produced or printed. */
export function comparableOutcome(outcome: ScenarioOutcome): unknown {
  return {
    exitCode: outcome.exitCode,
    txIds: outcome.txIds,
    unsignedTxJson: outcome.unsignedTxJson ?? null,
    submissions: outcome.submissions,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  };
}

export { CLI_ENTRY };
