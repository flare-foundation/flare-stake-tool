import { expect } from "chai";
import path from "path";
import fs from "fs";
import { runCli, makeTempDir, cleanupTempDir, EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "./cli-helper";
import { uniqueId, waitForLocalNetwork } from "./local-network";

const NETWORK = "localflare";

describe("CLI send (signed transaction flow)", function () {
  this.timeout(180_000);

  const txId = uniqueId("send-test");
  let tempDir: string;
  let unsignedDir: string;
  let signedDir: string;

  before(async () => {
    await waitForLocalNetwork();
    tempDir = makeTempDir();
    unsignedDir = path.join(tempDir, "ForDefiTxnFiles", "UnsignedTxns");
    signedDir = path.join(tempDir, "ForDefiTxnFiles", "SignedTxns");
    fs.mkdirSync(unsignedDir, { recursive: true });
    fs.mkdirSync(signedDir, { recursive: true });
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  it("init-ctx with public key creates ctx.json", () => {
    const result = runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", NETWORK], { cwd: tempDir });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(fs.existsSync(path.join(tempDir, "ctx.json"))).to.be.true;
  });

  it("transaction exportCP without signing produces an unsigned tx file", () => {
    const result = runCli(["transaction", "exportCP", "-a", "1", "-f", "1", "-i", txId, "--network", NETWORK], {
      cwd: tempDir,
    });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    const unsignedPath = path.join(unsignedDir, `${txId}.unsignedTx.json`);
    expect(fs.existsSync(unsignedPath), `expected ${unsignedPath} to exist`).to.be.true;
  });

  it("send: signs the unsigned tx and submits it to the network", () => {
    const unsignedPath = path.join(unsignedDir, `${txId}.unsignedTx.json`);
    const unsigned = JSON.parse(fs.readFileSync(unsignedPath, "utf-8"));

    // Sign the message hash with ewoq's private key, as an external signer would
    const message = unsigned.signatureRequests[0].message;
    const signature = signMessageHash(message);

    const signedTx = { ...unsigned, signature };
    fs.writeFileSync(path.join(signedDir, `${txId}.signedTx.json`), JSON.stringify(signedTx, null, 2));

    const result = runCli(["send", "-i", txId, "--network", NETWORK], { cwd: tempDir });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout.toLowerCase()).to.include("sent to the node");
  });

  it("send: refuses to submit the same transaction twice", () => {
    const result = runCli(["send", "-i", txId, "--network", NETWORK], { cwd: tempDir });
    expect(result.exitCode).to.not.equal(0);
    expect(result.stderr.toLowerCase()).to.include("already sent");
  });
});
