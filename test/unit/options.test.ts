import { expect } from "chai";
import path from "path";
import { getBytes, hexlify } from "ethers";
import { utils as futils } from "@flarenetwork/flarejs";
import { createEnv, writeContextFile } from "../../src/app/env";
import { accountFromPrivateKey } from "../../src/chain/keys";
import {
  BASE_DERIVATION_PATH,
  evmFeeOverrides,
  parseBlsHex,
  parseNodeId,
  parseNonce,
  pastEndTimeWarning,
} from "../../src/cli/inputs";
import { globalOptions, resolveAccount, resolveSigner, type GlobalOptions } from "../../src/cli/options";
import { parseAtomicTxRequest, parseEvmTxRequest } from "../../src/cli/requests";
import { FAKE_LEDGER_KEY_ENV } from "../../src/signers/ledger";
import { cleanupTempDir, makeTempDir, writeEnvFile } from "../helpers/cli";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";

const TO = "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC";
const NODE_ID = "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ";

describe("cli/inputs, cli/requests and cli/options", () => {
  describe("--nonce", () => {
    it("accepts non-negative integers and leaves an absent nonce to the chain", () => {
      expect(parseNonce(undefined)).to.equal(undefined);
      expect(parseNonce("")).to.equal(undefined);
      expect(parseNonce("0")).to.equal(0);
      expect(parseNonce("7")).to.equal(7);
    });

    it("refuses negative, fractional, exponent, hex and non-numeric values with a clear message", () => {
      for (const bad of ["-1", "1.5", "1e3", "0x10", "abc", " 7", "9007199254740993"]) {
        expect(() => parseNonce(bad), bad).to.throw(/--nonce must be a non-negative integer/);
      }
    });

    it("applies to exportCP (as bigint) and to the C-chain commands", () => {
      const exportCP = parseAtomicTxRequest("exportCP", { amount: "1", nonce: "7" }).request;
      expect(exportCP).to.include({ type: "exportCP", nonce: 7n });
      expect(() => parseAtomicTxRequest("exportCP", { amount: "1", nonce: "abc" })).to.throw(/--nonce must be/);
      expect(parseEvmTxRequest("withdrawal", { to: TO, amount: "1", nonce: "3" })).to.include({ nonce: 3 });
      expect(() => parseEvmTxRequest("withdrawal", { to: TO, amount: "1", nonce: "-1" })).to.throw(/--nonce must be/);
    });
  });

  describe("C-chain amounts", () => {
    it("keep the full 18 decimals for withdrawal and claim", () => {
      const withdrawal = parseEvmTxRequest("withdrawal", { to: TO, amount: "0.0000000001" });
      expect(withdrawal).to.include({ amount: 100_000_000n });
      const claim = parseEvmTxRequest("claim", { recipient: TO, amount: "4.123456789012345678" });
      expect(claim).to.include({ amount: 4_123_456_789_012_345_678n });
    });

    it("refuse more decimals than wei has", () => {
      expect(() => parseEvmTxRequest("withdrawal", { to: TO, amount: "0.0000000000000000001" })).to.throw(
        /at most 18 decimal places/
      );
    });
  });

  describe("parseBlsHex", () => {
    const key = "ab".repeat(48);
    const signature = "cd".repeat(96);

    it("accepts a 48-byte public key and a 96-byte signature, with or without 0x", () => {
      expect(parseBlsHex(key, "publicKey")).to.have.length(48);
      expect(parseBlsHex(`0x${key}`, "publicKey")).to.deep.equal(parseBlsHex(key, "publicKey"));
      expect(parseBlsHex(` 0x${signature} `, "signature")).to.have.length(96);
    });

    it("refuses non-hex input and wrong lengths, which used to slip through the interactive menu", () => {
      expect(() => parseBlsHex("zz", "publicKey")).to.throw(
        "BLS public key (--pop-bls-public-key) must be a hex string"
      );
      expect(() => parseBlsHex(key.slice(2), "publicKey")).to.throw(/must be 48 bytes, got 47/);
      expect(() => parseBlsHex(key, "signature")).to.throw(/BLS signature .* must be 96 bytes, got 48/);
      expect(() => parseBlsHex("", "signature")).to.throw(/must be 96 bytes, got 0/);
    });
  });

  describe("parseNodeId", () => {
    const BAD_CHECKSUM = "Node ID (--node-id) has a bad checksum; check it for a typo";

    it("accepts a node id with a valid checksum, trimmed", () => {
      expect(parseNodeId(NODE_ID)).to.equal(NODE_ID);
      expect(parseNodeId(` ${NODE_ID} `)).to.equal(NODE_ID);
    });

    it("refuses a node id with any one character mistyped, which flarejs would encode as another node", () => {
      const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      const encoded = NODE_ID.slice("NodeID-".length);
      for (let i = 0; i < encoded.length; i++) {
        const typo = alphabet[(alphabet.indexOf(encoded[i]!) + 1) % alphabet.length]!;
        const mistyped = `NodeID-${encoded.slice(0, i)}${typo}${encoded.slice(i + 1)}`;
        expect(() => parseNodeId(mistyped), mistyped).to.throw(BAD_CHECKSUM);
      }
    });

    it("refuses a missing prefix, characters outside base58 and a wrong length", () => {
      expect(() => parseNodeId(NODE_ID.slice("NodeID-".length))).to.throw(
        `Node ID (--node-id) must start with "NodeID-", got "${NODE_ID.slice("NodeID-".length)}"`
      );
      expect(() => parseNodeId("NodeID-0OIl")).to.throw("Node ID (--node-id) is not valid base58check");
      expect(() => parseNodeId(`NodeID-${futils.base58check.encode(new Uint8Array(19).fill(7))}`)).to.throw(
        "Node ID (--node-id) must be 20 bytes, got 19"
      );
    });

    it("is checked by every transaction that takes --node-id", () => {
      const mistyped = `${NODE_ID.slice(0, -1)}Y`;
      const common = { nodeId: mistyped, amount: "10000", endTime: "14d", period: "14d" };
      const bls = { popBlsPublicKey: "ab".repeat(48), popBlsSignature: "cd".repeat(96) };
      for (const type of ["stake", "delegate", "addAutoRenewedValidator", "setAutoRenewedValidatorConfig"]) {
        expect(() => parseAtomicTxRequest(type, { ...common, ...bls }), type).to.throw(BAD_CHECKSUM);
      }
    });
  });

  describe("pastEndTimeWarning", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");

    it("warns about an end time that is not in the future, e.g. 14 days given as plain seconds", () => {
      expect(pastEndTimeWarning(1_209_600n, now)).to.match(
        /End time 1209600 \(1970-01-15T00:00:00.000Z\) is not in the future; .*duration such as 14d/
      );
      expect(pastEndTimeWarning(BigInt(now / 1000), now)).to.match(/is not in the future/);
    });

    it("says nothing about a future end time", () => {
      expect(pastEndTimeWarning(BigInt(now / 1000) + 1n, now)).to.equal(undefined);
    });
  });

  describe("evmFeeOverrides (interactive)", () => {
    it("takes the C-chain fee options and nothing else from the parsed options", () => {
      const options = globalOptions({ gasLimit: "600000", maxFeePerGas: "3000", network: "costwo" });
      expect(evmFeeOverrides(options)).to.deep.equal({
        maxFeePerGas: "3000",
        priorityFeePerGas: undefined,
        gasLimit: "600000",
      });
      expect(evmFeeOverrides(globalOptions({}))).to.deep.equal({
        maxFeePerGas: undefined,
        priorityFeePerGas: undefined,
        gasLimit: undefined,
      });
    });

    it("refuses a bad value before the session starts", () => {
      expect(() => evmFeeOverrides(globalOptions({ gasLimit: "abc" }))).to.throw(
        /--gas-limit must be a positive integer/
      );
    });
  });

  describe("refused requests", () => {
    const BLS = { popBlsPublicKey: "0x" + "a1".repeat(48), popBlsSignature: "0x" + "b2".repeat(96) };

    it("names the missing option and its flag", () => {
      expect(() => parseAtomicTxRequest("delegate", { amount: "1", endTime: "14d" })).to.throw(
        "nodeId is required for delegate transaction. Use --node-id <nodeId> to specify the nodeId"
      );
      expect(() => parseEvmTxRequest("custom", { value: "1" })).to.throw(
        "to is required for customCChainTx transaction. Use --to <address> to specify the to"
      );
    });

    it("needs the list of setClaimExecutors and setAllowedClaimRecipients; an empty string clears it", () => {
      expect(() => parseEvmTxRequest("setClaimExecutors", {})).to.throw(
        '--executors is required for setClaimExecutors; to clear the stored list, pass --executors ""'
      );
      expect(() => parseEvmTxRequest("setAllowedClaimRecipients", {})).to.throw(
        '--recipients is required for setAllowedClaimRecipients; to clear the stored list, pass --recipients ""'
      );
      expect(parseEvmTxRequest("setClaimExecutors", { executors: [""] })).to.deep.include({ executors: [] });
      expect(parseEvmTxRequest("setAllowedClaimRecipients", { recipients: [""] })).to.deep.include({ recipients: [] });
    });

    it("refuses auto-compound shares that are not an integer from 0 to 1000000", () => {
      for (const autoCompoundShares of ["1000001", "-1", "0.5", "abc"]) {
        const options = { amount: "10000", nodeId: NODE_ID, period: "14d", ...BLS, autoCompoundShares };
        expect(() => parseAtomicTxRequest("addAutoRenewedValidator", options), autoCompoundShares).to.throw(
          "--auto-compound-shares must be an integer between 0 and 1000000 (millionths)"
        );
      }
      const options = { amount: "10000", nodeId: NODE_ID, period: "14d", ...BLS, autoCompoundShares: "1000000" };
      expect(parseAtomicTxRequest("addAutoRenewedValidator", options).request).to.include({ autoCompoundShares: 1e6 });
    });

    it("needs the validator of an auto-renew config change, by node id or validation tx id", () => {
      expect(() => parseAtomicTxRequest("setAutoRenewedValidatorConfig", { period: "0" })).to.throw(
        "setAutoRenewedValidatorConfig needs the validator: use --node-id <nodeId> or --validator-tx-id <txID>"
      );
    });

    it("refuses an unknown transaction type and a --value that is not an integer amount of wei", () => {
      expect(() => parseAtomicTxRequest("stakeAll", {})).to.throw("Unknown transaction type: stakeAll");
      for (const value of ["1.5", "1e18", "-1", "0x10"]) {
        expect(() => parseEvmTxRequest("custom", { to: TO, value }), value).to.throw(
          "--value must be an integer amount of wei"
        );
      }
    });
  });

  describe("globalOptions", () => {
    it("merges the program options with the command's, the command's winning", () => {
      const merged = globalOptions(
        { network: "costwo", transactionId: "from-program", ledger: true },
        { transactionId: "from-command", amount: "5" }
      );
      expect(merged).to.deep.equal({
        network: "costwo",
        transactionId: "from-command",
        ledger: true,
        amount: "5",
        derivationPath: BASE_DERIVATION_PATH,
        ctxFile: "ctx.json",
      });
    });

    it("defaults the derivation path and the context file only when they are not strings", () => {
      expect(globalOptions({}, {})).to.include({ derivationPath: BASE_DERIVATION_PATH, ctxFile: "ctx.json" });
      expect(globalOptions({ derivationPath: 3, ctxFile: true })).to.include({
        derivationPath: BASE_DERIVATION_PATH,
        ctxFile: "ctx.json",
      });
      expect(globalOptions({ derivationPath: "m/44'/60'/1'/0/0", ctxFile: "other.json" })).to.include({
        derivationPath: "m/44'/60'/1'/0/0",
        ctxFile: "other.json",
      });
    });
  });

  describe("the selected account", () => {
    // three accounts: the key file's, the (software) Ledger's and the context file's
    const keyFile = accountFromPrivateKey(getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`), "localflare");
    const ledgerKey = getBytes(`0x${"11".repeat(32)}`);
    const ledger = accountFromPrivateKey(ledgerKey, "localflare");
    const context = accountFromPrivateKey(getBytes(`0x${"22".repeat(32)}`), "localflare");
    const env = createEnv("localflare");
    let dir: string;
    let base: GlobalOptions;
    let previousFakeKey: string | undefined;
    let originalConsoleError: typeof console.error;

    before(() => {
      dir = makeTempDir("account-");
      const ctxFile = path.join(dir, "ctx.json");
      writeContextFile({ wallet: "publicKey", publicKey: context.publicKeyHex, network: "localflare" }, ctxFile);
      base = { derivationPath: BASE_DERIVATION_PATH, ctxFile, transactionId: "account-test" };
      previousFakeKey = process.env[FAKE_LEDGER_KEY_ENV];
      process.env[FAKE_LEDGER_KEY_ENV] = hexlify(ledgerKey);
      originalConsoleError = console.error;
      console.error = () => undefined; // the stand-in announces itself on every use
    });

    after(() => {
      console.error = originalConsoleError;
      if (previousFakeKey === undefined) delete process.env[FAKE_LEDGER_KEY_ENV];
      else process.env[FAKE_LEDGER_KEY_ENV] = previousFakeKey;
      cleanupTempDir(dir);
    });

    it("is the one transactions sign for, whatever the combination of selectors", async () => {
      const envPath = writeEnvFile(dir, EWOQ_PRIVATE_KEY_HEX);
      const cases: [string, Partial<GlobalOptions>, string][] = [
        ["--env-path", { envPath }, keyFile.pAddress],
        ["--ledger", { ledger: true }, ledger.pAddress],
        // info and send took the key file here, while transactions signed with the Ledger
        ["--ledger --env-path", { ledger: true, envPath }, ledger.pAddress],
        ["--get-hacked --env-path", { getHacked: true, envPath }, keyFile.pAddress],
        ["--get-hacked --env-path --ledger", { getHacked: true, envPath, ledger: true }, keyFile.pAddress],
        ["no selector", {}, context.pAddress],
      ];
      for (const [flags, selectors, expected] of cases) {
        const options = { ...base, ...selectors };
        const signer = await resolveSigner(options, env);
        expect((await signer.account()).pAddress, `${flags}: signer`).to.equal(expected);
        expect((await resolveAccount(options, env)).pAddress, `${flags}: account`).to.equal(expected);
      }
    });

    it("needs the key file of --get-hacked for info as well", async () => {
      const options = { ...base, getHacked: true };
      for (const resolve of [resolveSigner, resolveAccount]) {
        await resolve(options, env).then(
          () => expect.fail("resolved without a key file"),
          (error: unknown) => expect(String(error)).to.include("--get-hacked requires --env-path <file>")
        );
      }
    });
  });
});
