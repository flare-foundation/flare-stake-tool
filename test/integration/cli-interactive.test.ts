import { expect } from "chai";
import { runCli, makeTempDir, cleanupTempDir } from "./cli-helper";
import { createFundedAccount, type FundedAccount } from "./accounts";
import { fromNow, pickFreeNode, waitForLocalNetwork, type NodeInfo } from "./local-network";
import { spawnInteractive, KEYS } from "./interactive-helper";
import { networkConstants, taskConstants, walletConstants } from "../../src/constants/screen";

/** Number of DOWN presses to reach `key` in an inquirer list built from `table`. */
const menuIndex = (table: Record<string, string>, key: string): number => {
  const index = Object.keys(table).indexOf(key);
  if (index < 0) throw new Error(`menu entry ${key} not found`);
  return index;
};
const pressDown = (session: { send: (data: string) => void }, times: number): void => {
  for (let i = 0; i < times; i++) session.send(KEYS.DOWN);
};

const STAKE_DURATION_S = 60 * 60; // localflare minimum is 15 minutes

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

    // Menu 1: wallet type. Select Private Key.
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

    // Verify the stake tx was built and submitted.
    await session.waitFor("sent to the network", 60_000);
    expect(session.output.toLowerCase()).to.include("transaction with hash");

    session.send(KEYS.CTRL_C);
    await session.wait(10_000).catch(() => {
      session.kill();
    });
  });
});
