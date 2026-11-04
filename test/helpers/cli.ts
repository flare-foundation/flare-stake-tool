import { spawn, spawnSync, type SpawnSyncReturns } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const CLI_ENTRY = path.join(REPO_ROOT, "dist", "run.js");

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Extra environment variables (merged over process.env). */
  env?: Record<string, string>;
}

/**
 * Runs the built CLI (dist/run.js) synchronously. Spawns node directly rather than
 * the bin wrapper so a FLARE_RPC_URL / FAKE_NOW environment reaches the process
 * unchanged and no shell is involved.
 */
export function runCli(args: string[], options: RunCliOptions = {}): CliResult {
  if (!fs.existsSync(CLI_ENTRY)) {
    throw new Error(`${CLI_ENTRY} not found; run \`pnpm build\` first`);
  }
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf-8",
    timeout: options.timeoutMs ?? 60_000,
    env: { ...process.env, ...options.env },
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Asynchronous variant for callers that host a server in the same process
 * (the characterization proxy): spawnSync would block the event loop and
 * deadlock the child's RPC calls.
 */
export function spawnAsync(command: string, args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\n[killed after ${options.timeoutMs ?? 60_000}ms]`;
    }, options.timeoutMs ?? 60_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

export function runCliAsync(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  if (!fs.existsSync(CLI_ENTRY)) {
    throw new Error(`${CLI_ENTRY} not found; run \`pnpm build\` first`);
  }
  return spawnAsync(process.execPath, [CLI_ENTRY, ...args], options);
}

export function makeTempDir(prefix = "flare-stake-tool-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function writeEnvFile(dir: string, privateKeyHex: string, privateKeyCb58?: string): string {
  const envPath = path.join(dir, "test.env");
  const lines = [`PRIVATE_KEY_HEX="${privateKeyHex}"`];
  if (privateKeyCb58) lines.push(`PRIVATE_KEY_CB58="${privateKeyCb58}"`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n");
  return envPath;
}
