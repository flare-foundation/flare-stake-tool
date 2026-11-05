import { expect } from "chai";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { REPO_ROOT } from "../helpers/cli";
import { GOLDEN_DIR, updateRequested } from "./scenarios";

const SESSION = path.join(__dirname, "interactive-session.ts");
const GOLDEN = path.join(GOLDEN_DIR, "interactive-menu.txt");

/**
 * Interactive mode, offline: the scripted session in interactive-session.ts
 * drives the built menu through every task and wallet flow and must print the
 * transcript in test/golden/interactive-menu.txt (what the user is asked and
 * shown, the requests sent and the files written). UPDATE_GOLDENS=interactive-menu
 * (or "all") rewrites it after an intentional change.
 */
describe("interactive menu (offline, scripted)", function () {
  this.timeout(60_000);

  it("asks, prints and sends what the recorded transcript holds", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", SESSION], {
      cwd: REPO_ROOT,
      // colours on, so that the styling of every question is compared; an unreachable node, should a stub not apply
      env: { ...process.env, FORCE_COLOR: "1", FLARE_RPC_URL: "http://127.0.0.1:1" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status, `stderr: ${run.stderr}\nstdout tail: ${run.stdout.slice(-2000)}`).to.equal(0);
    if (updateRequested("interactive-menu")) {
      fs.writeFileSync(GOLDEN, run.stdout);
      return;
    }
    expect(run.stdout).to.equal(fs.readFileSync(GOLDEN, "utf8"));
  });
});
