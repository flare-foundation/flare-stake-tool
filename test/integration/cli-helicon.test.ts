import { expect } from "chai";
import path from "path";
import fs from "fs";
import { runCli, makeTempDir, cleanupTempDir, signMessageHash } from "./cli-helper";
import { createFundedAccount, type FundedAccount } from "./accounts";
import {
  getCurrentValidators,
  isHeliconActive,
  pickFreeNode,
  uniqueId,
  waitForLocalNetwork,
  waitForPTxCommitted,
  type NodeInfo,
} from "./local-network";

const NETWORK = "localflare";
const STAKE_AMOUNT = "10000"; // network minimum
const PERIOD = "15m"; // localflare minimum validation duration

/**
 * Helicon (ACP-236) auto-renewed validators: add one on a free node, change its
 * period through the unsigned-file flow (which must sign the authority
 * credential), delegate inside the cycle, stop it, and check the refusals.
 */
describe("CLI auto-renewed validators (Helicon, with network)", function () {
  this.timeout(300_000);

  let tempDir: string;
  let envPath: string;
  let account: FundedAccount;
  let node: NodeInfo | undefined;

  const signArgs = (): string[] => ["--get-hacked", "--env-path", envPath, "--network", NETWORK];

  before(async function () {
    await waitForLocalNetwork();
    if (!(await isHeliconActive())) {
      this.skip();
    }
    tempDir = makeTempDir();
    account = await createFundedAccount();
    envPath = account.writeEnv(tempDir);
    // fund the P-chain
    expect(
      runCli(["transaction", "exportCP", "-a", "50000", "-f", "1", ...signArgs()], { timeoutMs: 90_000 }).exitCode
    ).to.equal(0);
    await new Promise((r) => setTimeout(r, 3_000));
    expect(runCli(["transaction", "importCP", ...signArgs()], { timeoutMs: 90_000 }).exitCode).to.equal(0);
    node = await pickFreeNode();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  it("adds an auto-renewed validator with a 15 minute period", async function () {
    if (!node) this.skip();
    const result = runCli(
      [
        "transaction",
        "addAutoRenewedValidator",
        "-n",
        node.nodeID,
        "-a",
        STAKE_AMOUNT,
        "--period",
        PERIOD,
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
    const [validator] = await getCurrentValidators([node.nodeID]);
    expect(validator, "validator not current").to.not.equal(undefined);
    expect(validator!.validatorAuthority?.addresses).to.deep.equal([account.pAddress]);
    expect(validator!.nextPeriod).to.equal("900");
    expect(validator!.autoCompoundRewardShares).to.equal("0");
    expect(Number(validator!.endTime) - Number(validator!.startTime)).to.equal(900);
  });

  it("shows the auto-renew summary in info validators", function () {
    if (!node) this.skip();
    const result = runCli(["info", "validators", ...signArgs()]);
    expect(result.exitCode).to.equal(0);
    expect(result.stdout).to.include(`${node.nodeID}: auto-renewed:`);
    expect(result.stdout).to.include("next period 900s");
  });

  it("changes the period through the unsigned-file flow, signing the authority credential", async function () {
    if (!node) this.skip();
    const cwd = path.join(tempDir, "file-flow");
    fs.mkdirSync(cwd);
    expect(runCli(["init-ctx", "-p", account.publicKeyCompressed, "--network", NETWORK], { cwd }).exitCode).to.equal(0);
    const id = uniqueId("set-config");
    const build = runCli(
      [
        "transaction",
        "setAutoRenewedValidatorConfig",
        "-n",
        node.nodeID,
        "--period",
        "20m",
        "-i",
        id,
        "--network",
        NETWORK,
      ],
      { cwd }
    );
    expect(build.exitCode, `stderr: ${build.stderr}`).to.equal(0);
    const unsignedPath = path.join(cwd, "ForDefiTxnFiles", "UnsignedTxns", `${id}.unsignedTx.json`);
    const unsigned = JSON.parse(fs.readFileSync(unsignedPath, "utf-8"));
    expect(unsigned.transactionType).to.equal("setAutoRenewedValidatorConfig");
    const signature = signMessageHash(unsigned.signatureRequests[0].message, account.privateKeyHex);
    fs.mkdirSync(path.join(cwd, "ForDefiTxnFiles", "SignedTxns"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, "ForDefiTxnFiles", "SignedTxns", `${id}.signedTx.json`),
      JSON.stringify({ ...unsigned, signature }, null, 2)
    );
    const send = runCli(["send", "-i", id, "--network", NETWORK], { cwd, timeoutMs: 90_000 });
    expect(send.exitCode, `stderr: ${send.stderr}`).to.equal(0);
    expect(send.stdout.toLowerCase()).to.include("sent to the node");
    const [validator] = await getCurrentValidators([node.nodeID]);
    expect(validator!.nextPeriod).to.equal("1200");
  });

  it("delegates to the auto-renewed validator inside its current cycle", async function () {
    if (!node) this.skip();
    const [validator] = await getCurrentValidators([node.nodeID]);
    const endTime = String(Number(validator!.endTime) - 60);
    const result = runCli(
      ["transaction", "delegate", "-n", node.nodeID, "-a", STAKE_AMOUNT, "-e", endTime, ...signArgs()],
      {
        timeoutMs: 90_000,
      }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    const [after] = await getCurrentValidators([node.nodeID]);
    expect(after!.delegators?.length ?? 0).to.be.greaterThan(0);
  });

  it("refuses a delegation that outlasts the current cycle", function () {
    if (!node) this.skip();
    const result = runCli([
      "transaction",
      "delegate",
      "-n",
      node.nodeID,
      "-a",
      STAKE_AMOUNT,
      "-e",
      "2d",
      ...signArgs(),
    ]);
    expect(result.exitCode).to.not.equal(0);
    expect(result.stderr).to.include("within the validator's current period");
  });

  it("refuses a configuration change from a key that is not in the validator authority", async function () {
    if (!node) this.skip();
    const stranger = await createFundedAccount("1000");
    const strangerEnv = stranger.writeEnv(tempDir, "stranger.env");
    const result = runCli([
      "transaction",
      "setAutoRenewedValidatorConfig",
      "-n",
      node.nodeID,
      "--period",
      "0",
      "--get-hacked",
      "--env-path",
      strangerEnv,
      "--network",
      NETWORK,
    ]);
    expect(result.exitCode).to.not.equal(0);
    expect(result.stderr).to.include("is not in the validator authority");
  });

  it("refuses a period below the network minimum", function () {
    if (!node) this.skip();
    const result = runCli([
      "transaction",
      "setAutoRenewedValidatorConfig",
      "-n",
      node.nodeID,
      "--period",
      "60",
      ...signArgs(),
    ]);
    expect(result.exitCode).to.not.equal(0);
  });

  it("stops auto-renewal with --period 0", async function () {
    if (!node) this.skip();
    const result = runCli(
      ["transaction", "setAutoRenewedValidatorConfig", "-n", node.nodeID, "--period", "0", ...signArgs()],
      {
        timeoutMs: 90_000,
      }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    const txId = /hash (\w+)/.exec(result.stdout)?.[1];
    expect(txId).to.not.equal(undefined);
    await waitForPTxCommitted(txId!);
    const [validator] = await getCurrentValidators([node.nodeID]);
    expect(validator!.nextPeriod).to.equal("0");
  });

  it("signs with a software Ledger device (FLARE_FAKE_LEDGER_KEY) through the --ledger path", () => {
    const result = runCli(
      ["transaction", "transfer", "-a", "1", "--transfer-address", account.pAddress, "--ledger", "--network", NETWORK],
      { env: { FLARE_FAKE_LEDGER_KEY: account.privateKeyHex }, timeoutMs: 90_000 }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the network");
  });
});
