/**
 * Failure modes of the built CLI that need no node: every error must end with
 * exit code 1 so scripts notice, and nothing secret may reach the output. Also
 * the commands that need no node: the info shortcuts, and interactive mode
 * handling its options and refusing to start without a terminal.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { SigningKey } from "ethers";
import { accountFromPublicKey } from "../../src/chain/keys";
import { markSentToChain, writeSignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import { readGolden } from "../characterization/scenarios";
import { cleanupTempDir, makeTempDir, runCli, writeEnvFile } from "../helpers/cli";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "../helpers/keys";
import { NODE_A_POP, NODE_B_POP } from "../helpers/bls";
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

  it("never prints a key in an invalid --rpc-url, even percent-encoded", () => {
    const result = runCli(
      [
        "info",
        "validators",
        "--network",
        "localflare",
        "--rpc-url",
        "https://host.example:bad/ext/info?x%2Dapikey=SECRET",
      ],
      { cwd }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include('Invalid node URL "https://host.example:bad/ext/info?…"');
    expect(result.stderr + result.stdout).to.not.include("SECRET");
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

  it("warns once on stderr, without the key, when an API key would go over plain http to another machine", () => {
    const result = runCli(
      [
        "info",
        "validators",
        "--network",
        "localflare",
        "--rpc-url",
        "http://node.invalid:9650",
        "--api-key",
        "SECRET-KEY",
      ],
      { cwd }
    );
    expect(result.exitCode).to.equal(1); // no such host
    const warning = "Warning: the API key goes unencrypted to http://node.invalid:9650 over plain http";
    expect(result.stderr.split(warning)).to.have.length(2);
    expect(result.stderr + result.stdout).to.not.include("SECRET-KEY");
  });

  it("masks the API key in the http warning even where the node URL repeats it", () => {
    const result = runCli(
      [
        "info",
        "validators",
        "--network",
        "localflare",
        "--rpc-url",
        "http://node.invalid/TOPSECRET/ext/info",
        "--api-key",
        "TOPSECRET",
      ],
      { cwd }
    );
    expect(result.stderr).to.include(
      "Warning: the API key goes unencrypted to http://node.invalid/*** over plain http"
    );
    expect(result.stderr + result.stdout).to.not.include("TOPSECRET");
  });

  it("refuses an unknown info, transaction or forDefi type with the allowed ones, before looking for a context file", () => {
    for (const [args, choices] of [
      [["info", "foo"], "addresses, balance, validators"],
      [
        ["transaction", "stakeAll"],
        "exportCP, importCP, exportPC, importPC, stake, delegate, transfer, addAutoRenewedValidator, setAutoRenewedValidatorConfig",
      ],
      [["forDefi", "verify", "-i", "t1"], "sign, fetch"],
    ] as const) {
      const result = runCli([...args, "--network", "costwo"], { cwd });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.include(
        `error: command-argument value '${args[1]}' is invalid for argument`
      );
      expect(result.stderr, args.join(" ")).to.include(`Allowed choices are ${choices}.`);
    }
    const help = runCli(["info", "--help"], { cwd });
    expect(help.stdout).to.match(/\(choices:\s+"addresses",\s+"balance",\s+"validators"\)/); // wrapped anywhere
  });

  it("lists the global options a command takes in its own help", () => {
    for (const command of ["withdrawal", "transaction", "send"]) {
      const help = runCli([command, "--help"], { cwd });
      expect(help.exitCode, command).to.equal(0);
      expect(help.stdout, command).to.include("Global Options:");
      for (const flag of ["--network", "--ledger", "--get-hacked", "--gas-limit", "--rpc-url"]) {
        expect(help.stdout, `${command} ${flag}`).to.include(flag);
      }
    }
  });

  it("reports a missing transaction option before asking for a signer or a transaction id", () => {
    // no -i, no --ledger and no key file: the signer would be refused, but the missing node id comes first
    const result = runCli(["delegate", "-a", "1", "-e", "2d", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.not.include("A transaction id is required");
    expect(result.stderr).to.equal(
      "Error: nodeId is required for delegate transaction. Use --node-id <nodeId> to specify the nodeId\n"
    );
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

  it("warns on stderr about start and end times given in milliseconds", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const result = runCli(
      [
        "delegate",
        "-n",
        NODE_ID,
        "-a",
        "1",
        "-s",
        "1700000000000",
        "-e",
        "1800000000000",
        "-i",
        "ms1",
        "--network",
        "costwo",
      ],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.stderr).to.include("Warning: Start time 1700000000000 looks like milliseconds");
    expect(result.stderr).to.include("Warning: End time 1800000000000 looks like milliseconds");
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

  it("refuses a BLS key and signature of two nodes before anything is built", () => {
    const result = runCli(
      [
        "stake",
        "-n",
        NODE_ID,
        "-a",
        "10000",
        "-e",
        "14d",
        "--pop-bls-public-key",
        NODE_A_POP.publicKey,
        "--pop-bls-signature",
        NODE_B_POP.signature,
        "-i",
        "t1",
        "--network",
        "costwo",
      ],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("is not the proof of possession of the BLS public key");
  });

  it("refuses a mistyped --node-id before anything is built", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const bls = ["--pop-bls-public-key", NODE_A_POP.publicKey, "--pop-bls-signature", NODE_A_POP.signature];
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

  it("refuses an empty key file, context file, node, API key or vault id rather than using another one", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const empty = (flag: string): string => `Option ${flag} is empty; leave it out to use the default`;
    for (const [args, flag] of [
      // with ctx.json there, an empty --env-path took its account; send then checked the signature against none
      [["send", "-i", "t1", "--env-path", ""], "--env-path"],
      [["info", "addresses", "--env-path="], "--env-path"],
      [["exportCP", "-a", "1", "-f", "1", "-i", "t1", "--ctx-file", ""], "--ctx-file"],
      [["info", "balance", "--rpc-url", ""], "--rpc-url"],
      [["info", "balance", "--api-key", ""], "--api-key"],
      // spaces only: the network resolution reads them as no value, so the default node and FLARE_API_KEY were used
      [["info", "balance", "--rpc-url", " "], "--rpc-url"],
      [["info", "balance", "--api-key=\t"], "--api-key"],
      [["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--vault-id", "", "--ctx-file", "vault.json"], "--vault-id"],
      [["interactive", "--rpc-url", ""], "--rpc-url"],
    ] as const) {
      const result = runCli([...args, "--network", "costwo"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.include(empty(flag));
      expect(result.stdout, args.join(" ")).to.equal("");
    }
    expect(fs.existsSync(path.join(cwd, "vault.json")), "no context saved without its vault").to.equal(false);
  });

  it("refuses a time or period the chain can't hold, rather than building a malformed transaction or crashing", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const bls = ["--pop-bls-public-key", NODE_A_POP.publicKey, "--pop-bls-signature", NODE_A_POP.signature];
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

  it("warns that --derivation-path is ignored without --ledger", () => {
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const path5 = ["--derivation-path", "m/44'/60'/0'/0/5", "--network", "localflare"];
    const warning = "Warning: --derivation-path is read only with --ledger; it is ignored here";
    const keyFile = runCli(["info", "addresses", "--env-path", envPath, ...path5], { cwd });
    expect(keyFile.exitCode, keyFile.stderr).to.equal(0);
    expect(keyFile.stderr).to.include(warning);
    const ledger = runCli(["info", "addresses", "--ledger", ...path5], {
      cwd,
      env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
    });
    expect(ledger.exitCode, ledger.stderr).to.equal(0);
    expect(ledger.stderr).not.to.include(warning);
  });

  it("refuses the C-chain fee options for send, forDefi, info and init-ctx, which ignored them", () => {
    for (const [args, command] of [
      [["send", "-i", "w1", "--max-fee-per-gas", "99999"], "send"],
      [["forDefi", "fetch", "-i", "w1", "--gas-limit", "21000"], "forDefi fetch"],
      [["balance", "--priority-fee-per-gas", "1"], "info balance"],
      [["info", "addresses", "--gas-limit", "1", "--max-fee-per-gas", "2"], "info addresses"],
      [["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--gas-limit", "1"], "init-ctx"],
    ] as const) {
      const result = runCli([...args, "--network", "localflare"], { cwd });
      expect(result.exitCode, command).to.equal(1);
      expect(result.stderr, command).to.match(
        new RegExp(
          `^Error: ${command} doesn't use --[a-z-]+(, --[a-z-]+)?; leave (it|them) out \\(the C-chain gas options`
        )
      );
    }
    expect(fs.existsSync(path.join(cwd, "ctx.json")), "init-ctx wrote nothing").to.equal(false);
  });

  it("names the network of a transaction on stderr, and warns when it is Flare because nothing chose one", () => {
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const withdrawal = ["withdrawal", "-a", "1", "-t", "0x2222222222222222222222222222222222222222", "-i", "w1"];
    const fallback = "Warning: No --network was given and there is no context file: using flare";
    const unchosen = runCli([...withdrawal, "--env-path", envPath, "--rpc-url", CLOSED_NODE], { cwd });
    expect(unchosen.exitCode).to.equal(1); // at the node
    expect(unchosen.stderr).to.include(`Using network: flare\n${fallback}\n`);
    const chosen = runCli([...withdrawal, "--env-path", envPath, "--network", "costwo", "--rpc-url", CLOSED_NODE], {
      cwd,
    });
    expect(chosen.stderr).to.include("Using network: costwo\n");
    expect(chosen.stderr).not.to.include(fallback);
    // info names the network itself, but warns as well
    const info = runCli(["info", "addresses", "--env-path", envPath], { cwd });
    expect(info.exitCode, info.stderr).to.equal(0);
    expect(info.stderr).to.include(fallback);
    expect(info.stdout).to.include('Addresses on the network "flare"');
    // init-ctx writes a context every later command takes its network from; to a --ctx-file that doesn't exist yet too
    for (const file of ["ctx.json", "other.json"]) {
      const initCtx = runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--ctx-file", file], { cwd });
      expect(initCtx.exitCode, initCtx.stderr).to.equal(0);
      expect(initCtx.stderr, file).to.include(fallback);
      expect(JSON.parse(fs.readFileSync(path.join(cwd, file), "utf8"))).to.include({ network: "flare" });
    }
    // a context file there gives the network: no warning
    expect(runCli(["info", "addresses", "--env-path", envPath], { cwd }).stderr).not.to.include(fallback);
  });

  it("refuses -i with --get-hacked or --ledger on the four C-chain commands that wrote a file in 4.x, before signing", () => {
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const to = "0x2222222222222222222222222222222222222222";
    const commands: [string, string[]][] = [
      ["withdrawal", ["-a", "1", "-t", to]],
      ["setClaimExecutors", ["--executors", to]],
      ["setAllowedClaimRecipients", ["--recipients", to]],
      ["customCChainTx", ["--to", to]],
    ];
    for (const [command, args] of commands) {
      for (const [flag, signer] of [
        ["--get-hacked", ["--get-hacked", "--env-path", envPath]],
        ["--ledger", ["--ledger"]],
      ] as const) {
        // an empty -i too: `-i "$TX_ID"` with the variable unset
        for (const id of ["-i w1", "-i ", "--transaction-id="]) {
          const idArgs = id === "--transaction-id=" ? [id] : ["-i", id.slice(3)];
          const result = runCli(
            [command, ...args, ...idArgs, ...signer, "--network", "localflare", "--rpc-url", CLOSED_NODE],
            {
              cwd,
              env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
            }
          );
          expect(result.exitCode, `${command} ${flag} ${id}`).to.equal(1);
          expect(result.stderr, `${command} ${flag} ${id}`).to.include(
            `${command} with ${flag} signs and sends at once, where 4.x wrote the unsigned file -i names; ` +
              `leave out -i to sign and send now, or ${flag} to write the unsigned file`
          );
        }
      }
    }
    // claim signed in 4.4.0 too: -i with an immediate signer goes on to the node
    const claim = runCli(
      [
        "claim",
        "-r",
        to,
        "-i",
        "c1",
        "--get-hacked",
        "--env-path",
        envPath,
        "--network",
        "localflare",
        "--rpc-url",
        CLOSED_NODE,
      ],
      { cwd }
    );
    expect(claim.exitCode).to.equal(1);
    expect(claim.stderr).not.to.include("signs and sends at once");
    expect(claim.stderr).to.include(`node ${CLOSED_NODE}`);
  });

  it("forDefi sign checks the file against --network, over the context's network, before reading the token", () => {
    const { forDefiHash: _hash, ...unsigned } = readGolden("exportCP-file").outcome.unsignedTxJson as UnsignedTxJson;
    fs.mkdirSync(path.join(cwd, "ForDefiTxnFiles", "UnsignedTxns"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "ForDefiTxnFiles", "UnsignedTxns", "t1.unsignedTx.json"), JSON.stringify(unsigned));
    fs.writeFileSync(
      path.join(cwd, "ctx.json"),
      JSON.stringify({
        wallet: "publicKey",
        publicKey: EWOQ_PUBLIC_KEY_COMPRESSED,
        network: "localflare",
        vaultId: "v",
      })
    );
    const result = runCli(["forDefi", "sign", "-i", "t1", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include(
      "Transaction t1 is for network id 162, not costwo (114); select its network with --network"
    );
  });

  it("forDefi refuses fetching a signature once the transaction was sent", () => {
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
    expect(relay.stderr).to.equal(`Using network: localflare\nError: fetch failed (bad port; node ${CLOSED_NODE})\n`);
  });

  it("refuses an option the transaction type doesn't read, given on the command line, whatever its position", () => {
    for (const [args, refusal] of [
      [["transaction", "importCP", "-a", "5"], "transaction importCP doesn't use --amount; leave it out"],
      [["exportPC", "-a", "1", "-f", "1"], "transaction exportPC doesn't use --fee; leave it out"],
      [
        ["--gas-limit", "21000", "exportCP", "-a", "1", "-f", "1"],
        "transaction exportCP doesn't use --gas-limit; leave it out (the C-chain gas options are for the C-chain " +
          "commands; exportCP and importPC take --fee)",
      ],
    ] as const) {
      const result = runCli([...args, "--network", "costwo"], { cwd });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.equal(`Error: ${refusal}\n`);
    }
    // the defaults of --delegation-fee, --auto-compound-shares and --threshold are not given options
    const defaults = runCli(["transaction", "importCP", "--threshold", "1", "--network", "costwo"], { cwd });
    expect(defaults.stderr).to.include("A transaction id is required for the unsigned-file flow");
  });

  it("prints no part of a malformed FLARE_FAKE_LEDGER_KEY", () => {
    const malformed = `${"5a".repeat(31)}zz`;
    const result = runCli(["info", "addresses", "--ledger", "--network", "costwo"], {
      cwd,
      env: { FLARE_FAKE_LEDGER_KEY: malformed },
    });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include(
      "FLARE_FAKE_LEDGER_KEY is not a private key (32 bytes of hex); its value is not shown"
    );
    expect(result.stderr).not.to.include("5a5a5a");
  });

  it("refuses two signers instead of letting one win, before the key file or the Ledger is opened", () => {
    for (const [args, refusal] of [
      [
        ["info", "addresses", "--ledger", "--get-hacked", "--env-path", "missing.env"],
        "--ledger and --get-hacked select different signers; pass one of them",
      ],
      [
        ["transaction", "importCP", "--ledger", "--get-hacked", "--env-path", "missing.env"],
        "--ledger and --get-hacked select different signers; pass one of them",
      ],
      [["init-ctx", "--ledger", "-p", EWOQ_PUBLIC_KEY_COMPRESSED], "init-ctx takes --ledger or --public-key, not both"],
    ] as const) {
      const result = runCli([...args, "--network", "costwo"], {
        cwd,
        env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX, FLARE_RPC_URL: CLOSED_NODE },
      });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.equal(`Error: ${refusal}\n`);
    }
    expect(fs.existsSync(path.join(cwd, "ctx.json")), "no context written").to.equal(false);
    // a key file with --ledger is not a second signer: --ledger signs, as before
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const ledger = runCli(["info", "addresses", "--ledger", "--env-path", envPath, "--network", "costwo"], {
      cwd,
      env: { FLARE_FAKE_LEDGER_KEY: "22".repeat(32) },
    });
    expect(ledger.exitCode, ledger.stderr).to.equal(0);
    expect(ledger.stdout).to.include(
      accountFromPublicKey(new SigningKey(`0x${"22".repeat(32)}`).compressedPublicKey, "costwo").pAddress
    );
  });

  it("refuses a derivation path an app would read as another index, before the Ledger is asked", () => {
    const bad = "m/44'/60'/0'/0/1O";
    for (const args of [
      ["init-ctx", "--ledger", "--derivation-path", bad],
      ["info", "addresses", "--ledger", "--derivation-path", bad],
    ]) {
      const result = runCli([...args, "--network", "costwo"], {
        cwd,
        env: { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX },
      });
      expect(result.exitCode, args[0]).to.equal(1);
      expect(result.stderr, args[0]).to.include(`Invalid derivation path "${bad}" (--derivation-path)`);
      expect(result.stderr, `${args[0]}: the fake device was not opened`).not.to.include("FLARE_FAKE_LEDGER_KEY");
    }
    expect(fs.existsSync(path.join(cwd, "ctx.json")), "no context written").to.equal(false);
  });

  it("prints the absolute end time a duration resolves to, and tells ForDefi co-signers to pass it", () => {
    fs.writeFileSync(
      path.join(cwd, "ctx.json"),
      JSON.stringify({ wallet: "publicKey", publicKey: EWOQ_PUBLIC_KEY_COMPRESSED, network: "costwo" })
    );
    const args = ["delegate", "-n", "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ", "-a", "50000", "-e", "14d", "-i", "e1"];
    // the node is closed: the times are reported before anything is asked of it
    const result = runCli([...args, "--network", "costwo"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
    expect(result.exitCode).to.equal(1);
    const printed = /End time: (\d+) \(([^)]+)\)/.exec(result.stdout);
    expect(printed, result.stdout).to.not.equal(null);
    expect(new Date(Number(printed![1]) * 1000).toISOString()).to.equal(printed![2]);
    expect(Number(printed![1]) - Date.now() / 1000).to.be.within(14 * 86_400 - 60, 14 * 86_400 + 60);
    expect(result.stdout).to.include("Every signer of this ForDefi transaction has to pass this absolute unix time");
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
    const ewoqCAddress = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare").cAddress;
    // without the check, an EVM transaction signed by any key is valid on its own and would be sent from that key
    const context = { wallet: "publicKey", publicKey: EWOQ_PUBLIC_KEY_COMPRESSED, network: "localflare" };
    fs.writeFileSync(path.join(cwd, "ctx.json"), JSON.stringify(context));
    const unsigned = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedTxJson & { message: string };
    const signature = signMessageHash(unsigned.message, "22".repeat(32));
    const foreign = accountFromPublicKey(new SigningKey(`0x${"22".repeat(32)}`).compressedPublicKey, "localflare");
    for (const [file, refusal] of [
      // a file of an earlier version records no account: the context's is the one to check
      [
        { ...unsigned, signer: undefined },
        "The signature does not belong to the configured account (recovered address differs)",
      ],
      // this version's records the account it was built for, ewoq
      [
        unsigned,
        `Transaction w1 was built for ${ewoqCAddress}, but it is signed by ${foreign.cAddress}; it is not sent`,
      ],
    ] as const) {
      writeSignedTxJson({ ...file, signature }, "w1", cwd);
      const result = runCli(["send", "-i", "w1"], { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } });
      expect(result.exitCode).to.equal(1);
      expect(result.stderr).to.equal(`Using network: localflare\nError: ${refusal}\n`);
      const signed = JSON.parse(
        fs.readFileSync(path.join(cwd, "ForDefiTxnFiles", "SignedTxns", "w1.signedTx.json"), "utf8")
      ) as { isSentToChain?: boolean };
      expect(signed.isSentToChain).to.equal(undefined);
    }
  });

  it("takes the account of a key file with only PUBLIC_KEY, as 4.4.0 did, but refuses to sign with it", () => {
    const publicOnly = path.join(cwd, "public-key.txt");
    fs.writeFileSync(publicOnly, `PUBLIC_KEY=${EWOQ_PUBLIC_KEY_COMPRESSED}\n`);
    const info = runCli(["info", "addresses", "--env-path", publicOnly, "--network", "localflare"], { cwd });
    expect(info.exitCode, info.stderr).to.equal(0);
    expect(info.stdout).to.include("C-chain address hex: 0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC");
    // --get-hacked signs with the file: refused, and info shows no account a transaction would refuse
    for (const args of [
      ["exportCP", "-a", "1"],
      ["info", "addresses"],
    ]) {
      const signing = runCli([...args, "--get-hacked", "--env-path", publicOnly, "--network", "localflare"], {
        cwd,
        env: { FLARE_RPC_URL: CLOSED_NODE },
      });
      expect(signing.exitCode, args[0]).to.equal(1);
      expect(signing.stderr, args[0]).to.include(
        `Env file ${publicOnly} holds only a PUBLIC_KEY; signing needs PRIVATE_KEY_HEX`
      );
    }
  });

  it("send checks the signature against the account --env-path or --ledger selects, with no ctx.json", () => {
    // a file of an earlier version, which records no account, signed by another key than the one selected
    const unsigned = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedTxJson & { message: string };
    const signature = signMessageHash(unsigned.message, "22".repeat(32));
    const older = { ...unsigned, signer: undefined };
    const envPath = writeEnvFile(cwd, EWOQ_PRIVATE_KEY_HEX);
    const publicOnly = path.join(cwd, "public-key.txt");
    fs.writeFileSync(publicOnly, `PUBLIC_KEY=${EWOQ_PUBLIC_KEY_COMPRESSED}\n`);
    for (const [label, selector, env] of [
      ["--env-path", ["--env-path", envPath], {}],
      ["--env-path with only PUBLIC_KEY", ["--env-path", publicOnly], {}],
      ["--ledger", ["--ledger"], { FLARE_FAKE_LEDGER_KEY: EWOQ_PRIVATE_KEY_HEX }],
    ] as const) {
      writeSignedTxJson({ ...older, signature }, "w1", cwd);
      const result = runCli(["send", "-i", "w1", ...selector, "--network", "localflare"], {
        cwd,
        env: { FLARE_RPC_URL: CLOSED_NODE, ...env },
      });
      expect(result.exitCode, label).to.equal(1);
      expect(result.stderr, label).to.include(
        "The signature does not belong to the configured account (recovered address differs)"
      );
      const signed = JSON.parse(
        fs.readFileSync(path.join(cwd, "ForDefiTxnFiles", "SignedTxns", "w1.signedTx.json"), "utf8")
      ) as { isSentToChain?: boolean };
      expect(signed.isSentToChain, label).to.equal(undefined);
    }
    expect(fs.existsSync(path.join(cwd, "ctx.json"))).to.equal(false);
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

  it("says where the id goes when -i <id> comes before a command, where -i starts interactive mode", () => {
    for (const args of [
      ["-i", "myid", "exportCP", "-a", "1"],
      ["--network", "costwo", "-i", "myid", "exportCP"],
    ]) {
      const result = runCli(args, { cwd });
      expect(result.exitCode, args.join(" ")).to.equal(1);
      expect(result.stderr, args.join(" ")).to.equal(
        'Error: -i before a command starts interactive mode, which takes no arguments ("myid" given); to name a ' +
          "transaction, give -i <id> after the command, as in: exportCP -a 1 -f 0.001 -i myid\n"
      );
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
