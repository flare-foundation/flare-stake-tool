import { expect } from "chai";
import {
  BASE_DERIVATION_PATH,
  evmFeeOverridesFromArgv,
  parseBlsHex,
  parseNonce,
  pastEndTimeWarning,
} from "../../src/cli/inputs";
import { globalOptions } from "../../src/cli/options";
import { parseAtomicTxRequest, parseEvmTxRequest } from "../../src/cli/requests";

const TO = "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC";

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

  describe("evmFeeOverridesFromArgv (interactive)", () => {
    it("reads the C-chain fee options from the raw argv, in both forms", () => {
      expect(
        evmFeeOverridesFromArgv(["node", "run.js", "interactive", "--gas-limit", "600000", "--max-fee-per-gas=3000"])
      ).to.deep.equal({ maxFeePerGas: "3000", priorityFeePerGas: undefined, gasLimit: "600000" });
      expect(evmFeeOverridesFromArgv(["node", "run.js", "interactive"])).to.deep.equal({
        maxFeePerGas: undefined,
        priorityFeePerGas: undefined,
        gasLimit: undefined,
      });
    });

    it("takes the last occurrence, as Commander does, and refuses a flag without a value", () => {
      const argv = ["node", "run.js", "interactive", "--gas-limit", "100000", "--gas-limit", "500000"];
      expect(evmFeeOverridesFromArgv(argv).gasLimit).to.equal("500000");
      expect(() => evmFeeOverridesFromArgv(["node", "run.js", "interactive", "--gas-limit"])).to.throw(
        /--gas-limit needs a value/
      );
      expect(() =>
        evmFeeOverridesFromArgv(["node", "run.js", "interactive", "--max-fee-per-gas", "--gas-limit", "1"])
      ).to.throw(/--max-fee-per-gas needs a value/);
    });

    it("refuses a bad value before the session starts", () => {
      expect(() => evmFeeOverridesFromArgv(["node", "run.js", "interactive", "--gas-limit", "abc"])).to.throw(
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

    it("refuses auto-compound shares that are not an integer from 0 to 1000000", () => {
      for (const autoCompoundShares of ["1000001", "-1", "0.5", "abc"]) {
        const options = { amount: "10000", nodeId: "NodeID-X", period: "14d", ...BLS, autoCompoundShares };
        expect(() => parseAtomicTxRequest("addAutoRenewedValidator", options), autoCompoundShares).to.throw(
          "--auto-compound-shares must be an integer between 0 and 1000000 (millionths)"
        );
      }
      const options = { amount: "10000", nodeId: "NodeID-X", period: "14d", ...BLS, autoCompoundShares: "1000000" };
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
});
