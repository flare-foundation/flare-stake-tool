/**
 * C-chain EVM transactions signed directly (--get-hacked) on the local network.
 * claim, setClaimExecutors and setAllowedClaimRecipients read Flare's reward
 * contracts, which localflare does not have (the fixture recorder stubs those
 * reads: test/characterization/evm-stubs.ts); withdrawal and customCChainTx
 * need none, and the contracts called here are deployed by the test.
 */
import { expect } from "chai";
import { Wallet, parseEther, type TransactionResponse } from "ethers";
import { cleanupTempDir, makeTempDir, runCli, runCliAsync, type CliResult } from "../helpers/cli";
import { cChainProvider, createFundedAccount, type FundedAccount } from "./accounts";
import { waitForLocalNetwork } from "./local-network";

const NETWORK = "localflare";
/** Deploys runtime code 0x00 (STOP): every call succeeds and keeps the value sent. */
const ACCEPTING_INIT_CODE = "0x60006000526001601ff3";
/** Deploys runtime code 0x60006000fd (PUSH1 0, PUSH1 0, REVERT): every call reverts. */
const REVERTING_INIT_CODE = "0x6460006000fd6000526005601bf3";

function hashOf(result: CliResult): string {
  const hash = /Transaction with hash (0x[0-9a-fA-F]{64})/.exec(result.stdout)?.[1];
  if (!hash) throw new Error(`no transaction hash in the output:\n${result.stdout}\n${result.stderr}`);
  return hash;
}

async function until(condition: () => Promise<boolean>, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting until ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("CLI C-chain EVM transactions (with network)", function () {
  this.timeout(300_000);

  const provider = cChainProvider();
  let tempDir: string;
  let envPath: string;
  let account: FundedAccount;
  let wallet: Wallet;

  before(async () => {
    await waitForLocalNetwork();
    tempDir = makeTempDir();
    account = await createFundedAccount("1000");
    envPath = account.writeEnv(tempDir);
    wallet = new Wallet(account.privateKeyHex, provider);
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  const signArgs = (): string[] => ["--get-hacked", "--env-path", envPath, "--network", NETWORK];

  async function deploy(initCode: string): Promise<string> {
    const receipt = await (await wallet.sendTransaction({ data: initCode })).wait();
    if (!receipt?.contractAddress) throw new Error("contract not deployed");
    return receipt.contractAddress;
  }

  it("withdrawal: sends 1 FLR to another C-chain address with the account's next nonce", async () => {
    const recipient = Wallet.createRandom().address;
    const nonce = await provider.getTransactionCount(account.ethAddress, "latest");
    const result = runCli(["withdrawal", "-a", "1", "-t", recipient, ...signArgs()], { timeoutMs: 90_000 });
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    expect(result.stdout).to.include("sent to the network");
    const hash = hashOf(result);
    expect((await provider.getTransactionReceipt(hash))?.status).to.equal(1);
    expect((await provider.getTransaction(hash))?.nonce).to.equal(nonce);
    expect(await provider.getBalance(recipient)).to.equal(parseEther("1"));
  });

  it("withdrawal: takes the nonce after a transaction still waiting in the node instead of replacing it", async () => {
    // Held: a fee cap of 0 cannot pay the base fee, so the node keeps the transaction without mining it.
    const held = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      gasLimit: 21_000,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
    });
    let release: TransactionResponse | undefined;
    try {
      await until(
        async () => (await provider.getTransactionCount(wallet.address, "pending")) === held.nonce + 1,
        10_000,
        "the node counts the held transaction as pending"
      );
      expect(await provider.getTransactionCount(wallet.address, "latest")).to.equal(held.nonce);

      const recipient = Wallet.createRandom().address;
      const cli = runCliAsync(["withdrawal", "-a", "1", "-t", recipient, ...signArgs()], { timeoutMs: 120_000 });
      // With the "latest" nonce the CLI's transaction would replace the held one (it pays more) and be mined;
      // with "pending" it queues behind it.
      await until(
        async () => (await provider.getTransactionCount(wallet.address, "pending")) === held.nonce + 2,
        30_000,
        "the CLI's transaction waits behind the held one"
      );
      release = await wallet.sendTransaction({ to: wallet.address, value: 0n, gasLimit: 21_000, nonce: held.nonce });
      await release.wait();

      const result = await cli;
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      const hash = hashOf(result);
      expect((await provider.getTransactionReceipt(hash))?.status).to.equal(1);
      expect((await provider.getTransaction(hash))?.nonce).to.equal(held.nonce + 1);
      expect(await provider.getBalance(recipient)).to.equal(parseEther("1"));
    } finally {
      // never leave the held transaction blocking the account
      if (release === undefined && (await provider.getTransactionCount(wallet.address, "latest")) === held.nonce) {
        await (
          await wallet.sendTransaction({ to: wallet.address, value: 0n, gasLimit: 21_000, nonce: held.nonce })
        )
          .wait()
          .catch(() => undefined);
      }
    }
  });

  it("customCChainTx: calls a contract with the value and data given", async () => {
    const contract = await deploy(ACCEPTING_INIT_CODE);
    const result = runCli(
      ["customCChainTx", "--to", contract, "--value", "12345", "--data", "0xdeadbeef", ...signArgs()],
      { timeoutMs: 90_000 }
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
    const hash = hashOf(result);
    expect((await provider.getTransactionReceipt(hash))?.status).to.equal(1);
    const tx = await provider.getTransaction(hash);
    expect(tx?.to).to.equal(contract);
    expect(tx?.value).to.equal(12345n);
    expect(tx?.data).to.equal("0xdeadbeef");
    expect(await provider.getBalance(contract)).to.equal(12345n);
  });

  it("customCChainTx: a call that reverts exits 1 and names the mined transaction", async () => {
    const contract = await deploy(REVERTING_INIT_CODE);
    const result = runCli(["customCChainTx", "--to", contract, "--data", "0x01", ...signArgs()], { timeoutMs: 90_000 });
    expect(result.exitCode, `stdout: ${result.stdout}`).to.equal(1);
    const hash = /Transaction (0x[0-9a-fA-F]{64}) was mined but reverted/.exec(result.stderr)?.[1];
    expect(hash, result.stderr).to.be.a("string");
    expect((await provider.getTransactionReceipt(hash!))?.status).to.equal(0);
  });

  it("customCChainTx: uses --nonce as given, and the node refuses a nonce already used", async () => {
    const recipient = Wallet.createRandom().address;
    const nonce = await provider.getTransactionCount(account.ethAddress, "latest");
    const sent = runCli(
      ["customCChainTx", "--to", recipient, "--value", "1", "--nonce", String(nonce), ...signArgs()],
      { timeoutMs: 90_000 }
    );
    expect(sent.exitCode, `stderr: ${sent.stderr}`).to.equal(0);
    expect((await provider.getTransaction(hashOf(sent)))?.nonce).to.equal(nonce);

    const reused = runCli(
      ["customCChainTx", "--to", recipient, "--value", "1", "--nonce", String(nonce), ...signArgs()],
      { timeoutMs: 90_000 }
    );
    expect(reused.exitCode, `stdout: ${reused.stdout}`).to.equal(1);
    expect(reused.stderr.toLowerCase()).to.include("nonce");
    expect(await provider.getBalance(recipient)).to.equal(1n);
  });
});
