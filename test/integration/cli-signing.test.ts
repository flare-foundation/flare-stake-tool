import { expect } from "chai";
import { runCli, makeTempDir, cleanupTempDir } from "./cli-helper";
import { createFundedAccount, type FundedAccount } from "./accounts";
import {
  freshPAddress,
  fromNow,
  getCurrentValidators,
  getPBalance,
  pickFreeNode,
  sentTxId,
  waitForLocalNetwork,
  waitForPTxCommitted,
  type NodeInfo,
} from "./local-network";

const NETWORK = "localflare";

// Amounts are in FLR (the CLI converts to nFLR internally via getOptions)
const FEE = "1";
const EXPORT_AMOUNT = "100000";
const DELEGATE_AMOUNT = "10000"; // network minimum
const STAKE_AMOUNT = "10000"; // network minimum
// a fractional amount no other transaction pays, so the recipient's balance shows exactly this transfer
const TRANSFER_AMOUNT = "1.234567891";
const TRANSFER_NFLR = 1_234_567_891n;
// leaves room for the 1 FLR total import fee on the way back
const SMALL_AMOUNT = "10";
const STAKE_DURATION_S = 60 * 60; // localflare minimum is 15 minutes
const DELEGATE_DURATION_S = 30 * 60;

describe("CLI signing commands (with network)", function () {
  this.timeout(300_000);

  let tempDir: string;
  let envPath: string;
  let account: FundedAccount;
  let delegateTarget: string;

  before(async () => {
    await waitForLocalNetwork();
    tempDir = makeTempDir();
    account = await createFundedAccount();
    envPath = account.writeEnv(tempDir);
    // Delegate to the validator with the latest end time (the genesis validator), so the
    // delegation period always fits inside its validation period.
    const validators = await getCurrentValidators();
    const target = [...validators].sort((a, b) => Number(b.endTime) - Number(a.endTime))[0];
    if (!target) throw new Error("no current validators on the local network");
    delegateTarget = target.nodeID;
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  const sign = ["--get-hacked", "--env-path", () => envPath, "--network", NETWORK] as const;
  const signArgs = (): string[] => sign.map((a) => (typeof a === "function" ? a() : a));

  // Tests share state intentionally: exportCP funds the P-chain that
  // subsequent tests (importCP, delegate, exportPC) operate on.

  it("exportCP: moves 100,000 FLR from C-chain to P-chain", () => {
    const result = runCli(["transaction", "exportCP", "-a", EXPORT_AMOUNT, "-f", FEE, ...signArgs()], {
      timeoutMs: 90_000,
    });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("importCP: completes the C→P import", async () => {
    // the atomic export has to reach the P-chain's shared memory first
    await new Promise((r) => setTimeout(r, 3_000));
    const result = runCli(["transaction", "importCP", ...signArgs()], { timeoutMs: 90_000 });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("delegate: delegates 10,000 FLR to a current validator", async () => {
    await new Promise((r) => setTimeout(r, 2_000));
    const result = runCli(
      [
        "transaction",
        "delegate",
        "-n",
        delegateTarget,
        "-a",
        DELEGATE_AMOUNT,
        "-e",
        fromNow(DELEGATE_DURATION_S),
        ...signArgs(),
      ],
      { timeoutMs: 90_000 }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("stake: registers a free node as a new validator", async function () {
    await new Promise((r) => setTimeout(r, 2_000));
    const node: NodeInfo | undefined = await pickFreeNode();
    if (!node) {
      this.skip();
    }
    expect(node.nodeID).to.match(/^NodeID-/);
    const result = runCli(
      [
        "transaction",
        "stake",
        "-n",
        node.nodeID,
        "-a",
        STAKE_AMOUNT,
        "-e",
        fromNow(STAKE_DURATION_S),
        "--delegation-fee",
        "10",
        "--pop-bls-public-key",
        node.blsPublicKey,
        "--pop-bls-signature",
        node.blsProofOfPossession,
        ...signArgs(),
      ],
      { timeoutMs: 90_000 }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("transfer: pays exactly the amount to the recipient given", async () => {
    await new Promise((r) => setTimeout(r, 2_000));
    const recipient = freshPAddress();
    const result = runCli(
      ["transaction", "transfer", "-a", TRANSFER_AMOUNT, "--transfer-address", recipient, ...signArgs()],
      { timeoutMs: 90_000 }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
    await waitForPTxCommitted(sentTxId(result.stdout));
    expect(await getPBalance(recipient)).to.equal(TRANSFER_NFLR);
  });

  it("exportPC: moves 10 FLR from P-chain back to C-chain", async () => {
    await new Promise((r) => setTimeout(r, 2_000));
    const result = runCli(["transaction", "exportPC", "-a", SMALL_AMOUNT, ...signArgs()], { timeoutMs: 90_000 });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("importPC: completes the P→C import", async () => {
    // Atomic exports from P need a moment to propagate to C-chain's atomic mempool
    await new Promise((r) => setTimeout(r, 3_000));
    const result = runCli(["transaction", "importPC", "-f", FEE, ...signArgs()], { timeoutMs: 90_000 });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });

  it("delegate: rejects an unknown node id", () => {
    const result = runCli(
      [
        "transaction",
        "delegate",
        "-n",
        "NodeID-111111111111111111116DBWJs",
        "-a",
        DELEGATE_AMOUNT,
        "-e",
        fromNow(DELEGATE_DURATION_S),
        ...signArgs(),
      ],
      { timeoutMs: 90_000 }
    );
    expect(result.exitCode).to.not.equal(0);
    expect(result.stderr.toLowerCase()).to.include("unknown node id");
  });
});
