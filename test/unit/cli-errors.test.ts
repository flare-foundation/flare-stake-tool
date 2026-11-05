/**
 * Failure modes of the built CLI that need no node: every error must end with
 * exit code 1 so scripts notice, and nothing secret may reach the output. Also
 * the commands that need no node: the info shortcuts and the interactive banner.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { version } from "../../package.json";
import { accountFromPublicKey } from "../../src/chain/keys";
import { markSentToChain, writeSignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import { readGolden } from "../characterization/scenarios";
import { cleanupTempDir, makeTempDir, runCli } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

/** Nothing listens here, so a command that gets as far as the node fails fast. */
const CLOSED_NODE = "http://127.0.0.1:1";

describe("CLI errors (built CLI, no node)", function () {
  this.timeout(30_000);
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir("cli-errors-");
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  it("init-ctx with an invalid public key exits 1 and writes no context file", () => {
    const result = runCli(["init-ctx", "-p", "zz", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Invalid public key");
    expect(fs.existsSync(path.join(cwd, "ctx.json"))).to.equal(false);
  });

  it("info with an unknown type exits 1 before looking for a context file", () => {
    const result = runCli(["info", "foo", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include('Unknown information type "foo"; use addresses, balance, validators');
  });

  it("an invalid --rpc-url is reported without the API key it carries", () => {
    const result = runCli(
      ["info", "validators", "--network", "costwo", "--rpc-url", "ftp://host/ext/info?x-apikey=SECRET-KEY"],
      { cwd }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Invalid node URL");
    expect(result.stderr + result.stdout).to.not.include("SECRET-KEY");
  });

  it("warns on stderr about an end time in the past, such as 14 days given as plain seconds", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const result = runCli(
      ["delegate", "-n", "NodeID-x", "-a", "1", "-e", "1209600", "-i", "t1", "--network", "costwo"],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.stderr).to.include("Warning: End time 1209600 (1970-01-15T00:00:00.000Z) is not in the future");
    expect(result.stdout).to.not.include("Warning");
    expect(result.exitCode).to.equal(1); // the closed node, not the warning, ends the command
  });

  it("warns on stderr that --start-time does not delay a stake", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const result = runCli(
      ["delegate", "-n", "NodeID-x", "-a", "1", "-s", "2d", "-e", "14d", "-i", "t1", "--network", "costwo"],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.stderr).to.include("Warning: --start-time does not delay the stake");
    expect(result.stdout).to.not.include("Warning");
  });

  it("send and forDefi need the transaction id", () => {
    for (const [args, message] of [
      [["send"], "send needs the transaction id: -i <id>"],
      [["forDefi", "sign"], "forDefi needs the transaction id: -i <id>"],
    ] as const) {
      const result = runCli([...args], { cwd });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr).to.include(message);
    }
  });

  it("forDefi refuses an unknown action, and fetching a signature once the transaction was sent", () => {
    const unknown = runCli(["forDefi", "verify", "-i", "t1"], { cwd });
    expect(unknown.exitCode).to.equal(1);
    expect(unknown.stderr).to.include("Unknown forDefi action verify; use sign or fetch");

    const unsigned = readGolden("exportCP-file").outcome.unsignedTxJson as UnsignedTxJson;
    writeSignedTxJson({ ...unsigned, signature: "00".repeat(65) }, "t1", cwd);
    markSentToChain("t1", cwd);
    const fetched = runCli(["forDefi", "fetch", "-i", "t1"], { cwd });
    expect(fetched.exitCode).to.equal(1);
    expect(fetched.stderr).to.include("Tx already sent to chain");
  });

  it("init-ctx needs --ledger or --public-key", () => {
    const result = runCli(["init-ctx", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Either --ledger or --public-key must be specified");
  });

  it("a transaction needs a key file with --get-hacked, and an id for the unsigned-file flow", () => {
    const transaction = ["transaction", "exportCP", "-a", "1", "-f", "0.001", "--network", "costwo"];
    const hacked = runCli([...transaction, "--get-hacked"], { cwd });
    expect(hacked.exitCode).to.equal(1);
    expect(hacked.stderr).to.include(
      "--get-hacked requires --env-path <file> with PRIVATE_KEY_HEX or PRIVATE_KEY_CB58"
    );
    const unsignedFile = runCli(transaction, { cwd });
    expect(unsignedFile.exitCode).to.equal(1);
    expect(unsignedFile.stderr).to.include(
      "A transaction id is required for the unsigned-file flow: use -i <id>, or sign directly with --ledger or --get-hacked --env-path <file>"
    );
  });
});

describe("CLI commands that need no node (built CLI)", function () {
  this.timeout(30_000);
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir("cli-commands-");
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  /** Output compared as text: no colours, whatever the environment sets. */
  const PLAIN = { NO_COLOR: "1", FORCE_COLOR: "0" };

  // The balance and validators shortcuts are replayed against their recorded sessions (golden.test.ts).
  it("addresses is a shortcut for info addresses", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const account = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "costwo");
    const shortcut = runCli(["addresses"], { cwd, env: PLAIN });
    expect(shortcut.exitCode).to.equal(0);
    expect(shortcut.stdout).to.equal(
      'Addresses on the network "costwo"\n' +
        `P-chain address: ${account.pAddress}\n` +
        `C-chain address hex: ${account.cAddress}\n` +
        `secp256k1 public key: 0x${EWOQ_PUBLIC_KEY_COMPRESSED}\n`
    );
    expect(runCli(["info", "addresses"], { cwd, env: PLAIN }).stdout).to.equal(shortcut.stdout);
  });

  it("interactive mode shows the banner with the version, then asks for the wallet", () => {
    // without a terminal, inquirer cannot read an answer and the process ends after the first question
    const result = runCli(["interactive"], { cwd, env: PLAIN, timeoutMs: 20_000 });
    expect(result.exitCode, "the process ended").to.not.equal(-1);
    expect(result.stdout).to.include(`Version: ${version}`);
    expect(result.stdout).to.include("How do you want to connect your wallet?");
  });
});
