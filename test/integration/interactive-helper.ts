import * as pty from "node-pty";
import path from "path";
import fs from "fs";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_ENTRY = path.join(REPO_ROOT, "dist", "run.js");

// pnpm sometimes strips the execute bit from prebuilt native binaries
// during extraction. node-pty's spawn-helper needs to be executable for
// posix_spawnp to find it; chmod it once before the first spawn.
let spawnHelperFixed = false;
function ensureSpawnHelperExecutable(): void {
  if (spawnHelperFixed) return;
  // node-pty's package directory holds prebuilds for several platforms.
  // Resolve the package then walk to the matching prebuild.
  const ptyPkg = path.dirname(require.resolve("node-pty/package.json"));
  const platformDir = `${process.platform}-${process.arch}`;
  const helper = path.join(ptyPkg, "prebuilds", platformDir, "spawn-helper");
  try {
    fs.chmodSync(helper, 0o755);
  } catch {
    // ignore — file might already be executable, or we're using a build/
    // directory instead of prebuilds (locally rebuilt via node-gyp)
  }
  spawnHelperFixed = true;
}

// ANSI key sequences inquirer's list prompts respond to.
export const KEYS = {
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  ENTER: "\r",
  CTRL_C: "\x03",
  CTRL_D: "\x04",
};

export interface InteractiveSession {
  /** Stream of raw output bytes received so far. */
  output: string;
  /** Send keystrokes to the CLI. */
  send: (data: string) => void;
  /** Wait until the output contains `pattern`, throw on timeout. */
  waitFor: (pattern: string | RegExp, timeoutMs?: number) => Promise<void>;
  /** Wait for the process to exit. Returns its exit code, 128 + the signal when a signal ended it (as a shell does). */
  wait: (timeoutMs?: number) => Promise<number>;
  /** Kill the process. */
  kill: () => void;
}

export function spawnInteractive(args: string[] = ["interactive"], cwd: string = REPO_ROOT): InteractiveSession {
  ensureSpawnHelperExecutable();
  // Spawn node directly with the compiled entry point (rather than the bin
  // shell-script wrapper) so node-pty doesn't have to resolve a shebang.
  const term = pty.spawn(process.execPath, [CLI_ENTRY, ...args], {
    name: "xterm-color",
    cols: 120,
    rows: 30,
    cwd,
    env: process.env,
  });

  const session: InteractiveSession = {
    output: "",
    send: (data) => term.write(data),
    waitFor: (pattern, timeoutMs = 30_000) =>
      new Promise<void>((resolve, reject) => {
        const check = () => {
          const matches = typeof pattern === "string" ? session.output.includes(pattern) : pattern.test(session.output);
          if (matches) {
            clearInterval(interval);
            clearTimeout(timer);
            resolve();
          }
        };
        const interval = setInterval(check, 50);
        const timer = setTimeout(() => {
          clearInterval(interval);
          reject(
            new Error(`Timed out waiting for ${pattern}. Last 500 chars of output:\n${session.output.slice(-500)}`)
          );
        }, timeoutMs);
        check();
      }),
    wait: (timeoutMs = 60_000) =>
      new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Process did not exit in time")), timeoutMs);
        term.onExit(({ exitCode, signal }) => {
          clearTimeout(timer);
          // a process ended by SIGINT reports exit code 0 and signal 2: a shell shows 130
          resolve(signal ? 128 + signal : exitCode);
        });
      }),
    kill: () => term.kill(),
  };

  term.onData((data) => {
    session.output += data;
  });

  return session;
}
