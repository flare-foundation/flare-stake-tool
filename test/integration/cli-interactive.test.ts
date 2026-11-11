import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { stripVTControlCharacters } from "util";
import { runCli, makeTempDir, cleanupTempDir } from "./cli-helper";
import { createFundedAccount, type FundedAccount } from "./accounts";
import {
  freshPAddress,
  fromNow,
  getCurrentValidators,
  getNodeInfo,
  getPBalance,
  LOCAL_RPC_URL,
  pickFreeNode,
  waitForLocalNetwork,
  type NodeInfo,
} from "./local-network";
import { spawnInteractive, KEYS, type InteractiveSession } from "./interactive-helper";
import { networkConstants, taskConstants, walletConstants } from "../../src/constants/screen";
import { parseFlr } from "../../src/chain/units";
import { version } from "../../package.json";

/** Number of DOWN presses to reach `key` in an inquirer list built from `table`. */
const menuIndex = (table: Record<string, string>, key: string): number => {
  const index = Object.keys(table).indexOf(key);
  if (index < 0) throw new Error(`menu entry ${key} not found`);
  return index;
};
const pressDown = (session: { send: (data: string) => void }, times: number): void => {
  for (let i = 0; i < times; i++) session.send(KEYS.DOWN);
};

/**
 * Waits for `pattern` in the output after what earlier calls matched, and returns the output up to the match:
 * session.waitFor looks at the whole output, where a menu or a prompt shown before would match at once.
 */
function outputCursor(session: InteractiveSession): (pattern: string | RegExp, timeoutMs?: number) => Promise<string> {
  let mark = 0;
  return async (pattern, timeoutMs = 90_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const rest = stripVTControlCharacters(session.output).slice(mark);
      const index = typeof pattern === "string" ? rest.indexOf(pattern) : (pattern.exec(rest)?.index ?? -1);
      if (index >= 0) {
        const length = typeof pattern === "string" ? pattern.length : pattern.exec(rest)![0].length;
        mark += index + length;
        return rest.slice(0, index + length);
      }
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${String(pattern)}; output:\n${rest.slice(-800)}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
}

const STAKE_DURATION_S = 60 * 60; // localflare minimum is 15 minutes

describe("CLI interactive mode: exit codes (no network needed)", function () {
  this.timeout(60_000);
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  it("Ctrl-C at a list question ends the session with exit code 130", async () => {
    const session = spawnInteractive(["interactive"], cwd);
    await session.waitFor("How do you want to connect your wallet?");
    session.send(KEYS.CTRL_C);
    expect(await session.wait(10_000)).to.equal(130);
  });

  it("Ctrl-C at a text question ends the session with exit code 130", async () => {
    const session = spawnInteractive(["interactive"], cwd);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter Path to Private Key file");
    session.send("half an answer");
    session.send(KEYS.CTRL_C);
    expect(await session.wait(10_000)).to.equal(130);
  });

  it("Ctrl-D on an empty answer ends the session with exit code 130, and only deletes in a typed one", async () => {
    const session = spawnInteractive(["interactive"], cwd);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter Path to Private Key file");
    session.send("ab");
    session.send("\x1b[D"); // left: the cursor on "b", which Ctrl-D deletes
    session.send(KEYS.CTRL_D);
    session.send(KEYS.ENTER);
    await session.waitFor("File a doesn't exist"); // the session went on, with "a"
    await session.waitFor(/File a doesn't exist[^]*How do you want to connect your wallet\?/);
    session.send(KEYS.CTRL_D);
    expect(await session.wait(10_000)).to.equal(130);
  });

  it("Quit ends the session with exit code 0", async () => {
    const session = spawnInteractive(["interactive"], cwd);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "quit"));
    session.send(KEYS.ENTER);
    expect(await session.wait(10_000)).to.equal(0);
  });
});

describe("CLI interactive mode (with network)", function () {
  this.timeout(300_000);

  let tempDir: string;
  let envPath: string;
  let account: FundedAccount;
  let nodeInfo: NodeInfo | undefined;

  before(async () => {
    await waitForLocalNetwork();
    tempDir = makeTempDir();
    account = await createFundedAccount();
    // Interactive prompts the user for a private-key file path; we use "pktest"
    // so this matches the env path the test sends as input below.
    envPath = account.writeEnv(tempDir, "pktest");
    // Stake test needs P-chain funds; seed via direct CLI so the interactive
    // test can focus on the menu flow.
    runCli(
      [
        "transaction",
        "exportCP",
        "-a",
        "50000",
        "-f",
        "1",
        "--get-hacked",
        "--env-path",
        envPath,
        "--network",
        "localflare",
      ],
      { timeoutMs: 60_000 }
    );
    runCli(["transaction", "importCP", "--get-hacked", "--env-path", envPath, "--network", "localflare"], {
      timeoutMs: 60_000,
    });
    nodeInfo = await pickFreeNode();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  it("connects with private key, picks localflare, checks balance, and exits", async () => {
    const session = spawnInteractive(["interactive"], tempDir);

    // The banner with the version, then menu 1: wallet type. Select Private Key.
    await session.waitFor(`Version: ${version}`);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);

    // Prompt 2: path to private key file
    await session.waitFor("Enter Path to Private Key file");
    session.send("pktest");
    session.send(KEYS.ENTER);

    // Menu 3: network. Select localflare.
    await session.waitFor("Which network do you want to connect to?");
    pressDown(session, menuIndex(networkConstants, "localflare"));
    session.send(KEYS.ENTER);

    // Menu 4: action. Select "Check on-chain balance".
    await session.waitFor("What do you want to do?");
    pressDown(session, menuIndex(taskConstants, "balance"));
    session.send(KEYS.ENTER);

    // Verify the balance output mentions the account's C-chain address
    await session.waitFor(account.ethAddress, 60_000);
    expect(session.output.toLowerCase()).to.include("c-chain");
    expect(session.output.toLowerCase()).to.include("p-chain");

    // Exit cleanly. From the action menu, "Exit" is the last option;
    // here we just send Ctrl-C since we've already verified what we wanted.
    session.send(KEYS.CTRL_C);
    await session.wait(10_000).catch(() => {
      session.kill();
    });
  });

  it("prints an action error and returns to the menu instead of exiting", async () => {
    const session = spawnInteractive(["interactive"], tempDir);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter Path to Private Key file");
    session.send("pktest");
    session.send(KEYS.ENTER);
    await session.waitFor("Which network do you want to connect to?");
    pressDown(session, menuIndex(networkConstants, "localflare"));
    session.send(KEYS.ENTER);

    // Delegate to a node that is not a validator: the pre-flight check throws.
    await session.waitFor("What do you want to do?");
    pressDown(session, menuIndex(taskConstants, "delegate"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter amount");
    session.send("10000");
    session.send(KEYS.ENTER);
    await session.waitFor("Enter NodeId");
    session.send("NodeID-111111111111111111116DBWJs");
    session.send(KEYS.ENTER);
    await session.waitFor("Enter end time");
    session.send("20m");
    session.send(KEYS.ENTER);

    const menuPrompt = "What do you want to do?";
    const menusBefore = session.output.split(menuPrompt).length - 1;
    await session.waitFor("Error: Unknown node id", 60_000);
    // the menu must come back after the error, in the same session
    const deadline = Date.now() + 30_000;
    while (session.output.split(menuPrompt).length - 1 <= menusBefore) {
      if (Date.now() > deadline) throw new Error(`menu did not return after the error:\n${session.output.slice(-800)}`);
      await new Promise((r) => setTimeout(r, 100));
    }

    session.send(KEYS.CTRL_C);
    await session.wait(10_000).catch(() => {
      session.kill();
    });
  });

  it("Ctrl-C at a move's import confirmation says that the export was sent and where its funds wait", async () => {
    const session = spawnInteractive(["interactive"], tempDir);
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter Path to Private Key file");
    session.send("pktest");
    session.send(KEYS.ENTER);
    await session.waitFor("Which network do you want to connect to?");
    pressDown(session, menuIndex(networkConstants, "localflare"));
    session.send(KEYS.ENTER);

    await session.waitFor("What do you want to do?");
    pressDown(session, menuIndex(taskConstants, "CP"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter amount");
    session.send("1");
    session.send(KEYS.ENTER);
    await session.waitFor("Enter fee", 60_000);
    session.send(KEYS.ENTER); // the estimate
    await session.waitFor("Sign and send this transaction?", 60_000);
    session.send("y");
    session.send(KEYS.ENTER);
    // the export sent and arrived, the import built: cancel at its confirmation
    await session.waitFor(/Please approve import transaction[^]*Sign and send this transaction\?/, 120_000);
    session.send(KEYS.CTRL_C);
    expect(await session.wait(10_000)).to.equal(130);
    expect(session.output).to.match(
      /Export \w+ was sent: its funds wait on the P-chain; import them with "Import Funds"\./
    );
    // nothing left pending for the other tests
    runCli(["transaction", "importCP", "--get-hacked", "--env-path", envPath, "--network", "localflare"], {
      timeoutMs: 60_000,
    });
  });

  it("stakes a new validator via the menu flow", async function () {
    if (!nodeInfo) {
      this.skip();
    }
    const session = spawnInteractive(["interactive"], tempDir);

    // Same connect sequence: Private Key, "pktest", localflare.
    await session.waitFor("How do you want to connect your wallet?");
    pressDown(session, menuIndex(walletConstants, "privateKey"));
    session.send(KEYS.ENTER);
    await session.waitFor("Enter Path to Private Key file");
    session.send("pktest");
    session.send(KEYS.ENTER);
    await session.waitFor("Which network do you want to connect to?");
    pressDown(session, menuIndex(networkConstants, "localflare"));
    session.send(KEYS.ENTER);

    // Action menu: "Add a validator node".
    await session.waitFor("What do you want to do?");
    pressDown(session, menuIndex(taskConstants, "stake"));
    session.send(KEYS.ENTER);

    // Stake prompts (post-Durango: no startTime prompt).
    await session.waitFor("Enter amount");
    session.send("10000"); // FLR — network minimum
    session.send(KEYS.ENTER);

    await session.waitFor("Enter NodeId");
    session.send(nodeInfo.nodeID);
    session.send(KEYS.ENTER);

    await session.waitFor("Enter end time");
    session.send(fromNow(STAKE_DURATION_S));
    session.send(KEYS.ENTER);

    await session.waitFor("Enter delegation fee");
    session.send("10");
    session.send(KEYS.ENTER);

    await session.waitFor("Please enter the popBLSPublicKey");
    session.send(nodeInfo.blsPublicKey);
    session.send(KEYS.ENTER);

    await session.waitFor("Please enter the popBLSSignature");
    session.send(nodeInfo.blsProofOfPossession);
    session.send(KEYS.ENTER);

    // The summary of the built transaction, then the confirmation, which defaults to No.
    await session.waitFor("Sign and send this transaction?", 60_000);
    expect(session.output).to.include("About to sign stake on localflare:");
    expect(session.output).to.include(`Node: ${nodeInfo.nodeID}`);
    session.send("y");
    session.send(KEYS.ENTER);

    // Verify the stake tx was built and submitted.
    await session.waitFor("sent to the network", 60_000);
    expect(session.output.toLowerCase()).to.include("transaction with hash");

    session.send(KEYS.CTRL_C);
    await session.wait(10_000).catch(() => {
      session.kill();
    });
  });

  /**
   * A session on a fresh funded account, connected with its key file on localflare, and the steps of the menu: each
   * waits for its prompt after the previous one.
   */
  async function menuSession(keyName: string, cChainFlr: string) {
    const own = await createFundedAccount(cChainFlr);
    const keyFile = own.writeEnv(tempDir, keyName);
    const session = spawnInteractive(["interactive"], tempDir);
    const next = outputCursor(session);
    const answer = async (prompt: string, value: string): Promise<void> => {
      await next(prompt);
      session.send(value);
      session.send(KEYS.ENTER);
    };
    const task = async (key: keyof typeof taskConstants): Promise<void> => {
      await next("What do you want to do?");
      pressDown(session, menuIndex(taskConstants, key));
      session.send(KEYS.ENTER);
    };
    /** The summary of `type`, checked for its account and each of `lines`, before the confirmation is answered. */
    const summary = async (type: string, lines: string[]): Promise<string> => {
      const shown = await next("Sign and send this transaction?", 120_000);
      expect(shown, type).to.include(`About to sign ${type} on localflare:`);
      expect(shown, type).to.include(`Account: ${own.ethAddress} / ${own.pAddress}`);
      for (const line of lines) expect(shown, type).to.include(line);
      return shown;
    };
    /** Signs after the summary of `type`; returns the summary and the id of the transaction the node took. */
    const sign = async (type: string, lines: string[] = []): Promise<{ shown: string; txId: string }> => {
      const shown = await summary(type, lines);
      session.send("y");
      session.send(KEYS.ENTER);
      const outcome = await next(/sent to the network|Error: [^\n]*/, 120_000);
      expect(outcome, type).to.match(/sent to the network$/);
      return { shown, txId: /Transaction with hash (\S+) built and sent to the network$/.exec(outcome)![1]! };
    };
    /** Quits, and ends the session in any case. */
    const quit = async (): Promise<void> => {
      await task("quit");
      expect(await session.wait(15_000)).to.equal(0);
    };
    try {
      await next("How do you want to connect your wallet?");
      pressDown(session, menuIndex(walletConstants, "privateKey"));
      session.send(KEYS.ENTER);
      await answer("Enter Path to Private Key file", keyName);
      await next("Which network do you want to connect to?");
      pressDown(session, menuIndex(networkConstants, "localflare"));
      session.send(KEYS.ENTER);
    } catch (error) {
      session.kill();
      throw error;
    }
    return { own, keyFile, session, next, answer, task, summary, sign, quit };
  }

  /** The amount, or the fee, a summary shows, in nFLR. */
  const shownFlr = (shown: string, label: "Amount" | "Fee"): bigint =>
    parseFlr(new RegExp(`${label}: ([0-9.]+) LFLR`).exec(shown)![1]!);

  it("runs every menu option that needs no free node against the network, each after its summary", async function () {
    this.timeout(600_000);
    const validator = (await getNodeInfo(LOCAL_RPC_URL)).nodeID; // the genesis validator, to delegate to
    const recipient = freshPAddress();
    const { own, keyFile, session, next, answer, task, summary, sign, quit } = await menuSession(
      "pk-every-option",
      "50000"
    );
    try {
      await task("addresses");
      expect(await next(/secp256k1 public key: \S+/)).to.include(own.pAddress);
      await task("validators");
      expect(await next(validator)).to.include(validator);

      // both moves, the fee estimate taken with Enter; the P-chain balance is what the summaries showed
      await task("CP");
      await answer("Enter amount", "15000");
      await answer("Enter fee", "");
      await sign("exportCP", ["Amount: 15000 LFLR from the C-chain to the P-chain"]);
      const toP = await sign("importCP", ["to the P-chain"]);
      const afterCP = shownFlr(toP.shown, "Amount");
      expect(await getPBalance(own.pAddress)).to.equal(afterCP);
      await task("PC");
      await answer("Enter amount", "5");
      const toC = await sign("exportPC", ["Amount: 5 LFLR from the P-chain to the C-chain"]);
      await answer("Enter fee", "");
      await sign("importPC", ["to the C-chain"]);
      expect(await getPBalance(own.pAddress)).to.equal(afterCP - 5_000_000_000n - shownFlr(toC.shown, "Fee"));

      // Import Funds, both ways, of an export made on the command line
      for (const [destination, exported, imported] of [
        ["P", ["exportCP", "-a", "1", "-f", "0.01"], "importCP"],
        ["C", ["exportPC", "-a", "1"], "importPC"],
      ] as const) {
        const result = runCli(
          ["transaction", ...exported, "--get-hacked", "--env-path", keyFile, "--network", "localflare"],
          { timeoutMs: 90_000 }
        );
        expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await task("import");
        await next("Please select the destination chain");
        if (destination === "C") session.send(KEYS.DOWN);
        session.send(KEYS.ENTER);
        if (destination === "C") await answer("Enter fee", "");
        await sign(imported, [`to the ${destination}-chain`]);
      }

      // No signs and sends nothing; Yes is waited for: nothing is sent while the question is open
      const transferLines = ["Amount: 1.5 LFLR", `To: ${recipient}`];
      await task("transfer");
      await answer("Enter amount", "1.5");
      await answer("Enter destination P-chain address", recipient);
      await summary("transfer", transferLines);
      session.send("n");
      session.send(KEYS.ENTER);
      await next("Not signed; nothing was sent.");
      await task("transfer"); // the menu came back
      expect(await getPBalance(recipient), "after No").to.equal(0n);
      await answer("Enter amount", "1.5");
      await answer("Enter destination P-chain address", recipient);
      await summary("transfer", transferLines);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const output = stripVTControlCharacters(session.output);
      expect(output.slice(output.lastIndexOf("Sign and send this transaction?")), "before the answer").to.not.include(
        "submitted"
      );
      expect(await getPBalance(recipient), "before the answer").to.equal(0n);
      session.send("y");
      session.send(KEYS.ENTER);
      expect(await next(/sent to the network|Error: [^\n]*/, 120_000)).to.match(/sent to the network$/);
      expect(await getPBalance(recipient)).to.equal(1_500_000_000n);

      // the delegation the node took: to the node given, for the amount and the time given, owned by the account
      await task("delegate");
      await answer("Enter amount", "10000");
      await answer("Enter NodeId", validator);
      const answeredAt = Math.floor(Date.now() / 1000);
      await answer("Enter end time", "30m");
      const { txId } = await sign("delegate", ["Amount: 10000 LFLR", `Node: ${validator}`]);
      const [genesis] = await getCurrentValidators([validator]);
      const delegation = (genesis?.delegators ?? []).find((d) => d.txID === txId) as
        { endTime: string; weight: string; rewardOwner: { addresses: string[] } } | undefined;
      expect(delegation, "the delegation, on the node given").to.not.equal(undefined);
      expect(delegation!.weight).to.equal("10000000000000");
      expect(Number(delegation!.endTime) - answeredAt).to.be.within(30 * 60, 30 * 60 + 60);
      expect(delegation!.rewardOwner.addresses).to.deep.equal([own.pAddress]);

      // localflare has none of Flare's reward contracts: the error is reported and the menu comes back
      await task("claim");
      await next(/Error: [^\n]*/);
      await quit();
    } finally {
      session.kill();
    }
  });

  it("adds an auto-renewed validator through the menu, changes its period and stops it", async function () {
    this.timeout(300_000);
    // a node of its own; the renewal is stopped below, so the node is free again after one 15 minute period
    const node = await pickFreeNode(nodeInfo ? [nodeInfo.nodeID] : []);
    if (!node) {
      this.skip();
    }
    const current = async () => (await getCurrentValidators([node.nodeID]))[0];
    const { own, keyFile, session, next, answer, task, summary, sign, quit } = await menuSession(
      "pk-auto-renew",
      "11000"
    );
    let added = false;
    let stopped = false;
    try {
      await task("CP");
      await answer("Enter amount", "10010");
      await answer("Enter fee", "");
      await sign("exportCP", ["Amount: 10010 LFLR from the C-chain to the P-chain"]);
      await sign("importCP", ["to the P-chain"]);

      await task("addAutoRenewedValidator");
      await answer("Enter amount", "10000");
      await answer("Enter NodeId", node.nodeID);
      await answer("Enter the validation period", "15m");
      await answer("Enter delegation fee", "10");
      await answer("Please enter the popBLSPublicKey", node.blsPublicKey);
      await answer("Please enter the popBLSSignature", node.blsProofOfPossession);
      await summary("addAutoRenewedValidator", [
        "Amount: 10000 LFLR",
        `Node: ${node.nodeID}`,
        "Period: 15m (900 s)",
        "Delegation fee: 10%",
      ]);
      // nothing is sent before the Yes; from it on, the validator may exist, even if waiting for its status fails
      added = true;
      session.send("y");
      session.send(KEYS.ENTER);
      expect(await next(/sent to the network|Error: [^\n]*/, 120_000)).to.match(/sent to the network$/);
      const validator = await current();
      expect(validator?.weight).to.equal("10000000000000");
      expect(validator?.["delegationFee"]).to.equal("10.0000");
      expect(validator?.validatorAuthority?.addresses).to.deep.equal([own.pAddress]);
      expect(validator?.nextPeriod).to.equal("900");

      await task("setAutoRenewedValidatorConfig");
      await answer("Enter NodeId", node.nodeID);
      await answer("Enter the validation period", "20m");
      await sign("setAutoRenewedValidatorConfig", [`Node: ${node.nodeID}`, "Period: 20m (1200 s) from the next cycle"]);
      expect((await current())?.nextPeriod).to.equal("1200");

      // a period of 0 has a confirmation of its own before the summary
      await task("setAutoRenewedValidatorConfig");
      await answer("Enter NodeId", node.nodeID);
      await answer("Enter the validation period", "0");
      await next("A period of 0 stops auto-renewal");
      session.send("y");
      session.send(KEYS.ENTER);
      await sign("setAutoRenewedValidatorConfig", ["Period: 0: auto-renewal stops at the end of the current cycle"]);
      expect((await current())?.nextPeriod).to.equal("0");
      stopped = true;
      await quit();
    } finally {
      session.kill();
      // a failure once the validator may exist must not leave it renewing, holding its node for later runs
      if (added && !stopped) {
        const stop = runCli(
          [
            "transaction",
            "setAutoRenewedValidatorConfig",
            "-n",
            node.nodeID,
            "--period",
            "0",
            "--get-hacked",
            "--env-path",
            keyFile,
            "--network",
            "localflare",
          ],
          { timeoutMs: 90_000 }
        );
        // stopped only if the chain lists it with no next period: absent, it may be an add still pending. Otherwise the
        // key is kept outside the temp directory, which `after` deletes, with the command that stops it (not thrown:
        // the test's own failure stays the one reported)
        const confirmed = await current().then(
          (validator) => validator?.nextPeriod === "0",
          () => false
        );
        if (!confirmed) {
          const kept = path.join(os.tmpdir(), `auto-renew-recovery-${node.nodeID}.key`);
          fs.copyFileSync(keyFile, kept);
          console.error(
            `An auto-renewed validator on ${node.nodeID} may exist and still renew (stop exited ${stop.exitCode}: ` +
              `${stop.stderr.trim().replace(/\s+/g, " ")}). Stop it with: node dist/run.js transaction setAutoRenewedValidatorConfig ` +
              `-n ${node.nodeID} --period 0 --get-hacked --env-path ${kept} --network localflare`
          );
        }
      }
    }
  });
});
