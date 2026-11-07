/**
 * Failure modes of the built CLI that need no node: every error must end with
 * exit code 1 so scripts notice, and nothing secret may reach the output. Also
 * the commands that need no node: the info shortcuts, and interactive mode
 * handling its options and refusing to start without a terminal.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { accountFromPublicKey } from "../../src/chain/keys";
import { markSentToChain, writeSignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import { readGolden } from "../characterization/scenarios";
import { cleanupTempDir, makeTempDir, runCli, writeEnvFile } from "../helpers/cli";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "../helpers/keys";
import { version } from "../../package.json";

/** Nothing listens here, so a command that gets as far as the node fails fast. */
const CLOSED_NODE = "http://127.0.0.1:1";
/** A node id with a valid checksum. */
const NODE_ID = "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ";

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

  it("init-ctx --ledger prints the address to check on the device and saves the device's key", () => {
    const account = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "costwo");
    const result = runCli(["init-ctx", "--ledger", "--network", "costwo"], {
      cwd,
      env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
    });
    expect(result.exitCode, result.stderr).to.equal(0);
    expect(result.stderr).to.include(`Check that the Ledger shows the address ${account.cAddress} at m/44'/60'/0'/0/0`);
    expect(JSON.parse(fs.readFileSync(path.join(cwd, "ctx.json"), "utf8"))).to.deep.equal({
      wallet: "ledger",
      publicKey: EWOQ_PUBLIC_KEY_COMPRESSED,
      ethAddress: account.cAddress,
      flareAddress: account.pAddress,
      network: "costwo",
      derivationPath: "m/44'/60'/0'/0/0",
    });
  });

  it("send and forDefi refuse an id that names a file outside ForDefiTxnFiles", () => {
    for (const args of [
      ["send", "-i", "../../escape"],
      ["forDefi", "fetch", "-i", "../escape"],
    ]) {
      const result = runCli([...args, "--network", "costwo"], { cwd });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.include(`Invalid transaction id "${args.at(-1)!}"`);
    }
  });

  it("never prints the password of a node URL, which the fetch error repeats", () => {
    const result = runCli(
      ["info", "validators", "--network", "localflare", "--rpc-url", "https://user:SECRET@127.0.0.1:1"],
      {
        cwd,
      }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr + result.stdout).to.not.include("SECRET");
    expect(result.stderr).to.include("https://***@127.0.0.1:1");
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
    const result = runCli(["delegate", "-n", NODE_ID, "-a", "1", "-e", "1209600", "-i", "t1", "--network", "costwo"], {
      cwd,
      env: { FLARE_RPC_URL: CLOSED_NODE },
    });
    expect(result.stderr).to.include("Warning: End time 1209600 (1970-01-15T00:00:00.000Z) is not in the future");
    expect(result.stdout).to.not.include("Warning");
    expect(result.exitCode).to.equal(1); // the closed node, not the warning, ends the command
  });

  it("warns on stderr that --start-time does not delay a stake", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const result = runCli(
      ["delegate", "-n", NODE_ID, "-a", "1", "-s", "2d", "-e", "14d", "-i", "t1", "--network", "costwo"],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.stderr).to.include("Warning: --start-time does not delay the stake");
    expect(result.stdout).to.not.include("Warning");
  });

  it("refuses a mistyped --node-id before anything is built", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const bls = ["--pop-bls-public-key", "ab".repeat(48), "--pop-bls-signature", "cd".repeat(96)];
    const mistyped = `${NODE_ID.slice(0, -1)}Y`;
    const result = runCli(
      ["stake", "-n", mistyped, "-a", "10000", "-e", "14d", ...bls, "-i", "t1", "--network", "costwo"],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Node ID (--node-id) has a bad checksum; check it for a typo");
  });

  it("refuses an empty -a rather than exporting or claiming everything", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    for (const args of [
      ["exportPC", "-a", "", "-i", "t1"],
      ["claim", "-a", "", "-r", "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC", "-i", "t1"],
    ]) {
      const result = runCli([...args, "--network", "costwo"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
      expect(result.exitCode, args[0]).to.equal(1);
      expect(result.stderr, args[0]).to.include("Option --amount is empty; leave it out to use the default");
    }
  });

  it("refuses a time or period the chain can't hold, rather than building a malformed transaction or crashing", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const bls = ["--pop-bls-public-key", "ab".repeat(48), "--pop-bls-signature", "cd".repeat(96)];
    for (const [args, message] of [
      [["delegate", "-n", NODE_ID, "-a", "1", "-e", "15000000w"], 'Invalid time "15000000w"'], // was a RangeError
      [["delegate", "-n", NODE_ID, "-a", "1", "-e", "18446744073709551621"], 'Invalid time "18446744073709551621"'],
      [
        ["addAutoRenewedValidator", "-n", NODE_ID, "-a", "10000", "--period", "40000000000000w", ...bls],
        'Invalid duration "40000000000000w"',
      ],
    ] as const) {
      const result = runCli([...args, "-i", "t1", "--network", "costwo"], {
        cwd,
        env: { FLARE_RPC_URL: CLOSED_NODE },
      });
      expect(result.exitCode, args[0]).to.equal(1);
      expect(result.stderr, args[0]).to.include(message).and.not.include("RangeError");
    }
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

  it("send needs the key file of --get-hacked too, rather than checking against the context file", () => {
    // the account in ctx.json is not the one --get-hacked selects, so it must not stand in for the missing key file
    const context = { wallet: "publicKey", publicKey: EWOQ_PUBLIC_KEY_COMPRESSED, network: "costwo" };
    fs.writeFileSync(path.join(cwd, "ctx.json"), JSON.stringify(context));
    const result = runCli(["send", "-i", "t1", "--get-hacked", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include(
      "--get-hacked requires --env-path <file> with PRIVATE_KEY_HEX or PRIVATE_KEY_CB58"
    );
  });

  it("send refuses a given --ctx-file that does not exist; without one, it goes on to the node", () => {
    const unsigned = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedTxJson & { message: string };
    writeSignedTxJson({ ...unsigned, signature: signMessageHash(unsigned.message) }, "w1", cwd);
    for (const file of ["missing.json", "ctx.json"]) {
      const result = runCli(["send", "-i", "w1", "--ctx-file", file], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
      expect(result.exitCode, file).to.equal(1);
      expect(result.stderr, file).to.include(`Context file ${file} does not exist`);
    }
    // no context file at all: the account is the one that signed, and the send gets as far as the node
    const relay = runCli(["send", "-i", "w1", "--network", "localflare"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
    expect(relay.exitCode).to.equal(1);
    expect(relay.stderr).to.equal(`Error: fetch failed (bad port; node ${CLOSED_NODE})\n`);
  });

  it("refuses a given --ctx-file that does not exist whatever else selects the account, but init-ctx writes it", () => {
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    for (const selectors of [
      ["--ledger", "--derivation-path", "m/44'/60'/0'/0/0"],
      ["--get-hacked", "--env-path", envPath],
      ["--env-path", envPath],
    ]) {
      const result = runCli(["info", "addresses", ...selectors, "--ctx-file", "missing.json", "--network", "costwo"], {
        cwd,
        env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
      });
      expect(result.exitCode, selectors.join(" ")).to.equal(1);
      expect(result.stderr, selectors.join(" ")).to.include(
        "Context file missing.json does not exist (given with --ctx-file)"
      );
    }
    for (const action of ["fetch", "sign"]) {
      // fetch reads no context, and nothing is asked of ForDefi before the refusal
      const result = runCli(["forDefi", action, "-i", "t1", "--ctx-file", "missing.json"], { cwd });
      expect(result.exitCode, action).to.equal(1);
      expect(result.stderr, action).to.include("Context file missing.json does not exist (given with --ctx-file)");
    }
    const created = runCli(
      ["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo", "--ctx-file", "new.json"],
      {
        cwd,
      }
    );
    expect(created.exitCode, created.stderr).to.equal(0);
    expect(fs.existsSync(path.join(cwd, "new.json"))).to.equal(true);
  });

  it("send refuses a file signed by another key than ctx.json's, before it contacts the node", () => {
    // without the check, an EVM transaction signed by any key is valid on its own and would be sent from that key
    const context = { wallet: "publicKey", publicKey: EWOQ_PUBLIC_KEY_COMPRESSED, network: "localflare" };
    fs.writeFileSync(path.join(cwd, "ctx.json"), JSON.stringify(context));
    const unsigned = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedTxJson & { message: string };
    writeSignedTxJson({ ...unsigned, signature: signMessageHash(unsigned.message, "22".repeat(32)) }, "w1", cwd);
    const result = runCli(["send", "-i", "w1"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.equal(
      "Error: The signature does not belong to the configured account (recovered address differs)\n"
    );
    const signed = JSON.parse(
      fs.readFileSync(path.join(cwd, "ForDefiTxnFiles", "SignedTxns", "w1.signedTx.json"), "utf8")
    ) as { isSentToChain?: boolean };
    expect(signed.isSentToChain).to.equal(undefined);
  });

  it("setClaimExecutors and setAllowedClaimRecipients need their list before anything is signed", () => {
    // signing directly: without the check, an omitted list would be signed and sent as a clearing call
    const keyFile = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const signing = ["--get-hacked", "--env-path", keyFile, "--network", "localflare", "--rpc-url", CLOSED_NODE];
    for (const [command, flag] of [
      ["setClaimExecutors", "--executors"],
      ["setAllowedClaimRecipients", "--recipients"],
    ] as const) {
      const result = runCli([command, ...signing], { cwd });
      expect(result.exitCode).to.equal(1);
      expect(result.stderr).to.include(`${flag} is required for ${command}; to clear the stored list, pass ${flag} ""`);
    }
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

  it("finds a shortcut after the global options, skipping their values", () => {
    // a context file named like a command: its name is the value of --ctx-file, not the command
    const init = runCli(
      ["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo", "--ctx-file", "balance"],
      {
        cwd,
      }
    );
    expect(init.exitCode).to.equal(0);
    const plain = runCli(["info", "addresses", "--ctx-file", "balance"], { cwd, env: PLAIN });
    expect(plain.exitCode).to.equal(0);
    for (const args of [
      ["--network", "costwo", "--ctx-file", "balance", "addresses"],
      ["--ctx-file=balance", "--blind", "addresses"],
    ]) {
      const shortcut = runCli(args, { cwd, env: PLAIN });
      expect(shortcut.exitCode, args.join(" ")).to.equal(0);
      expect(shortcut.stdout, args.join(" ")).to.equal(plain.stdout);
    }
    // a transaction shortcut too: it gets as far as asking for the signing mode
    const exportCP = runCli(["--network", "costwo", "exportCP", "-a", "1", "-f", "0.001"], { cwd });
    expect(exportCP.exitCode).to.equal(1);
    expect(exportCP.stderr).to.include("A transaction id is required for the unsigned-file flow");
  });

  it("--version prints the version whatever command follows it, interactive mode included", () => {
    for (const args of [
      ["--version", "interactive"],
      ["-V", "-i"],
      ["--network", "costwo", "--version", "balance"],
    ]) {
      const result = runCli(args, { cwd, env: PLAIN });
      expect(result.exitCode, args.join(" ")).to.equal(0);
      expect(result.stdout, args.join(" ")).to.equal(`${version}\n`);
    }
  });

  it("interactive --help shows the help of interactive mode and starts nothing, -i included", () => {
    for (const args of [
      ["interactive", "--help"],
      ["-i", "--help"],
      ["--network", "costwo", "-i", "-h"],
    ]) {
      const result = runCli(args, { cwd, env: PLAIN });
      expect(result.exitCode, args.join(" ")).to.equal(0);
      expect(result.stdout, args.join(" ")).to.match(/^Usage: flare-stake-tool interactive \[options\]\n/);
      expect(result.stderr, args.join(" ")).to.equal("");
    }
  });

  it("interactive refuses an unknown option or a bad value before it looks for a terminal", () => {
    const misspelled = runCli(["interactive", "--gas-lmit", "250000"], { cwd, env: PLAIN });
    expect(misspelled.exitCode).to.equal(1);
    expect(misspelled.stderr).to.include("error: unknown option '--gas-lmit'");
    expect(misspelled.stdout).to.equal("");
    const bad = runCli(["-i", "--gas-limit", "abc"], { cwd, env: PLAIN });
    expect(bad.exitCode).to.equal(1);
    expect(bad.stderr).to.match(/^Error: Option --gas-limit must be a positive integer/);
    expect(bad.stdout).to.equal("");
  });

  it("interactive refuses the options it doesn't use and a bad node URL, before it looks for a terminal", () => {
    const refused = (flags: string): string =>
      `Error: interactive mode asks for the wallet and network itself; leave out ${flags} ` +
      "(it uses --rpc-url, --api-key and the C-chain fee options)\n";
    for (const [args, flags] of [
      [["--network", "costwo", "-i"], "--network"],
      [["interactive", "--ledger"], "--ledger"],
      [["interactive", "--blind"], "--blind"],
      [["interactive", "--derivation-path", "m/44'/60'/0'/0/1"], "--derivation-path"],
      [["interactive", "--ctx-file", "other.json"], "--ctx-file"],
      [["interactive", "--env-path", "keys"], "--env-path"],
      [["interactive", "--get-hacked"], "--get-hacked"],
      [["--network", "costwo", "-i", "--ctx-file", "other.json"], "--network, --ctx-file"],
    ] as const) {
      const result = runCli([...args], { cwd, env: PLAIN });
      expect(result.exitCode, flags).to.equal(1);
      expect(result.stderr, flags).to.equal(refused(flags));
      expect(result.stdout, flags).to.equal("");
    }
    // a bad node URL used to fail only after the wallet questions, and every wallet then failed again
    for (const [args, env] of [
      [["-i", "--rpc-url", "ftp://node"], PLAIN],
      [["interactive"], { ...PLAIN, FLARE_RPC_URL: "ftp://node" }],
    ] as const) {
      const result = runCli([...args], { cwd, env });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.equal(
        'Error: Invalid node URL "ftp://node"; only http and https are supported\n'
      );
    }
  });

  // The banner and the menu need a terminal: test/integration/cli-interactive.test.ts drives them through a PTY.
  it("interactive mode refuses to start without a terminal, before the banner", () => {
    // also after global options, which used to end in Commander's empty interactive command with exit code 0
    for (const args of [
      ["interactive"],
      ["-i"],
      ["--rpc-url", CLOSED_NODE, "interactive"],
      ["--gas-limit=250000", "-i"],
    ]) {
      const command = args.join(" ");
      const result = runCli(args, { cwd, env: PLAIN, timeoutMs: 20_000 });
      expect(result.exitCode, command).to.equal(1);
      expect(result.stderr, command).to.equal(
        "Error: interactive mode needs a terminal; use the commands instead (see --help)\n"
      );
      expect(result.stdout, command).to.equal("");
    }
  });
});
