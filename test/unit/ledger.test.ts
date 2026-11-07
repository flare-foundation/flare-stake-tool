/**
 * The Ledger code that runs without a device: signature shapes, the Avalanche
 * app's path split, the software stand-in used by tests, how LedgerSigner
 * handles the Flare app's refusals, which device call each transaction kind and
 * app goes to, and how it holds on to the device's account.
 */
import { expect } from "chai";
import fc from "fast-check";
import { evmSignatureHex, rsvHex, toHex } from "../../src/ledger/bytes";
import { splitAvalanchePath } from "../../src/ledger/avalanche";
import { ETHEREUM_APP_P_CHAIN, detectApp } from "../../src/ledger/index";
import { SigningKey, Transaction, getBytes, keccak256 } from "ethers";
import {
  bundleFromUnsignedTxJson,
  type UnsignedAtomicTxJson,
  type UnsignedEvmTxJson,
  type UnsignedTxJson,
} from "../../src/core/files";
import {
  FAKE_LEDGER_KEY_ENV,
  LedgerSigner,
  fakeLedgerDevice,
  ledgerDevice,
  type LedgerApp,
  type LedgerDevice,
} from "../../src/signers/ledger";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

/** The normalization each app module carried a copy of up to 5.0.0, kept as the reference. */
function previousEvmSignatureHex(response: { r: string; s: string; v: number | string }): string {
  const r = Buffer.from(toHex(response.r, false), "hex");
  const s = Buffer.from(toHex(response.s, false), "hex");
  let recoveryParam = parseInt(toHex(response.v, false), 16);
  if (recoveryParam === 0 || recoveryParam === 1) {
    recoveryParam += 27;
  } else if (recoveryParam > 28) {
    recoveryParam = recoveryParam % 2 === 1 ? 27 : 28;
  }
  const v = Buffer.from(recoveryParam.toString(16), "hex");
  return toHex(Buffer.concat([r, s, v]), false);
}

const R = "11".repeat(32);
const S = "22".repeat(32);

describe("ledger", () => {
  describe("evmSignatureHex", () => {
    it("returns r|s|v with v as 27/28 for v given as 0/1, 27/28 or EIP-155 (chain 14: 63/64)", () => {
      for (const [v, expected] of [
        ["00", "1b"],
        ["01", "1c"],
        ["1b", "1b"],
        ["1c", "1c"],
        ["3f", "1b"],
        ["40", "1c"],
        [0, "1b"],
        [28, "1c"],
      ] as const) {
        expect(evmSignatureHex({ r: R, s: S, v }), String(v)).to.equal(R + S + expected);
      }
    });

    it("matches the previous per-app copies for every v a device can return (0/1, 27/28, EIP-155 from 35)", () => {
      const deviceV = fc.oneof(fc.constantFrom(0, 1, 27, 28), fc.integer({ min: 35, max: 255 }));
      fc.assert(
        fc.property(deviceV, (v) => {
          const hex = v.toString(16).padStart(2, "0");
          expect(evmSignatureHex({ r: R, s: S, v: hex })).to.equal(previousEvmSignatureHex({ r: R, s: S, v: hex }));
        })
      );
    });

    it("refuses a v no signature can have, which the previous copies turned into a malformed signature", () => {
      for (const v of [2, 15, 26, 29, 34]) {
        expect(() => evmSignatureHex({ r: R, s: S, v }), String(v)).to.throw(/Invalid signature v/);
      }
      expect(previousEvmSignatureHex({ r: R, s: S, v: "02" })).to.have.length(128); // v byte silently lost
    });

    it("refuses a missing r, s or v", () => {
      expect(() => evmSignatureHex({ r: "", s: S, v: "00" })).to.throw(/Failed to get the signature/);
      expect(() => evmSignatureHex({ r: R, s: S, v: "" })).to.throw(/Failed to get the signature/);
    });
  });

  it("rsvHex concatenates the device's r, s and v buffers and refuses a partial answer", () => {
    const r = Buffer.from(R, "hex");
    const s = Buffer.from(S, "hex");
    expect(rsvHex({ r, s, v: Buffer.from([1]) }, "the hash")).to.equal(R + S + "01");
    expect(() => rsvHex({ r, s }, "the hash")).to.throw(
      "Failed to get the signature of the hash from the Ledger device"
    );
  });

  describe("splitAvalanchePath", () => {
    it("splits after the account level, whatever the number of digits", () => {
      expect(splitAvalanchePath("m/44'/60'/0'/0/0")).to.deep.equal({ accountPath: "m/44'/60'/0'", signPath: "0/0" });
      // these two broke with the previous fixed-offset split
      expect(splitAvalanchePath("m/44'/60'/0'/0/10")).to.deep.equal({ accountPath: "m/44'/60'/0'", signPath: "0/10" });
      expect(splitAvalanchePath("m/44'/60'/12'/0/0")).to.deep.equal({ accountPath: "m/44'/60'/12'", signPath: "0/0" });
    });

    it("refuses a path that is not m/44'/coin'/account'/change/index", () => {
      for (const bad of ["m/44'/60'/0'", "44'/60'/0'/0/0", "m/44'/60'/0'/0/0/1"]) {
        expect(() => splitAvalanchePath(bad), bad).to.throw(/Unsupported derivation path/);
      }
    });
  });

  describe("detectApp", () => {
    it("asks the device on every call, so that switching apps between operations takes effect", async () => {
      const open = ["Ethereum", "Flare Network", "Avalanche"];
      const openAppName = () => Promise.resolve(open.shift()!);
      expect(await detectApp(openAppName)).to.equal("Ethereum");
      expect(await detectApp(openAppName)).to.equal("Flare");
      expect(await detectApp(openAppName)).to.equal("Avalanche");
    });

    it("names the open app when it is not supported", async () => {
      for (const [name, shown] of [
        ["Bitcoin", "Bitcoin"],
        ["", "none"],
      ]) {
        await detectApp(() => Promise.resolve(name!)).then(
          () => expect.fail(`detected an app for "${name}"`),
          (error: unknown) => expect(String(error)).to.include(`(open app: ${shown})`)
        );
      }
    });
  });

  describe(`the ${FAKE_LEDGER_KEY_ENV} stand-in`, () => {
    const key = Buffer.from(EWOQ_PRIVATE_KEY_HEX, "hex");

    it("answers on test networks and is refused on flare and songbird", async () => {
      const device = fakeLedgerDevice(key);
      expect(await device.getPublicKey("m/44'/60'/0'/0/0", "costwo")).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
      for (const hrp of ["flare", "songbird"]) {
        await device.getPublicKey("m/44'/60'/0'/0/0", hrp).then(
          () => expect.fail(`the stand-in answered on ${hrp}`),
          (error: unknown) =>
            expect(String(error)).to.include(`a software key stands in for the Ledger, which is refused on ${hrp}`)
        );
      }
    });

    it("is announced on stderr whenever it replaces the device", () => {
      const original = console.error;
      const printed: string[] = [];
      console.error = (message: string) => printed.push(message);
      try {
        ledgerDevice({ [FAKE_LEDGER_KEY_ENV]: EWOQ_PRIVATE_KEY_HEX });
      } finally {
        console.error = original;
      }
      expect(printed.join("\n")).to.include(`${FAKE_LEDGER_KEY_ENV} is set: --ledger signs with that software key`);
    });
  });

  describe("LedgerSigner with the Flare app", () => {
    const bundle = bundleFromUnsignedTxJson(readGolden("delegate-file").outcome.unsignedTxJson as UnsignedTxJson);
    const HASH_SIGNATURE = "ab".repeat(65);

    /** An answer of the Flare app with status 0x6984 ("Data is invalid"), shaped like the Zondax ResponseError. */
    const invalidData = (detail: string): Error =>
      Object.assign(new Error(`Data is invalid : ${detail}`), {
        returnCode: 0x6984,
        errorMessage: `Data is invalid : ${detail}`,
      });

    /** A Flare app whose full-transaction signing fails with `refusal`; records the hashes it signs. */
    function flareApp(refusal: Error): { device: LedgerDevice; signedHashes: string[] } {
      const signedHashes: string[] = [];
      const device: LedgerDevice = {
        detectApp: () => Promise.resolve("Flare"),
        getPublicKey: () => Promise.resolve(EWOQ_PUBLIC_KEY_COMPRESSED),
        signHash: (_path, hashHex) => {
          signedHashes.push(hashHex);
          return Promise.resolve(HASH_SIGNATURE);
        },
        signTransaction: () => Promise.reject(refusal),
        signEvmTransaction: () => Promise.reject(new Error("not an EVM transaction")),
      };
      return { device, signedHashes };
    }

    /** Runs `action` with console.log captured; returns what it printed. */
    async function logged(action: () => Promise<unknown>): Promise<string> {
      const original = console.log;
      const printed: string[] = [];
      console.log = (message: string) => printed.push(message);
      try {
        await action();
      } finally {
        console.log = original;
      }
      return printed.join("\n");
    }

    it("reports a device error with its message and keeps the device's error as the cause", async () => {
      const refusal = new Error("Transaction rejected by the user");
      const { device, signedHashes } = flareApp(refusal);
      await new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare").sign(bundle).then(
        () => expect.fail("signing should fail"),
        (error: unknown) => {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal("Ledger signing error: Transaction rejected by the user");
          expect((error as Error).cause).to.equal(refusal);
        }
      );
      expect(signedHashes).to.deep.equal([]); // no fallback to blind signing
    });

    it("falls back to signing the hash when the app does not recognise the transaction", async () => {
      const { device, signedHashes } = flareApp(invalidData("Unrecognized error code"));
      let result: unknown;
      const printed = await logged(async () => {
        result = await new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare").sign(bundle);
      });
      expect(result).to.deep.equal({ status: "signed", signature: getBytes(`0x${HASH_SIGNATURE}`) });
      expect(signedHashes).to.deep.equal([Buffer.from(bundle.digest).toString("hex")]);
      expect(printed).to.include("does not recognise delegate transactions; signing the transaction hash instead");
    });

    it("does not fall back on other invalid-data answers, which fail instead", async () => {
      const { device, signedHashes } = flareApp(invalidData("Value out of range"));
      await new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare").sign(bundle).then(
        () => expect.fail("signing should fail"),
        (error: unknown) => expect(String(error)).to.include("Ledger signing error")
      );
      expect(signedHashes).to.deep.equal([]);
    });
  });

  describe("LedgerSigner routes by transaction kind and app", () => {
    const PATH = "m/44'/60'/3'/0/7"; // not the default one, to see it reach every device call
    const atomicJson = readGolden("delegate-file").outcome.unsignedTxJson as UnsignedAtomicTxJson;
    const evmJson = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedEvmTxJson;
    const SIGNATURE = "cd".repeat(65);
    const SIGNED = { status: "signed", signature: getBytes(`0x${SIGNATURE}`) };

    /** A device with `app` open that answers every signing call with SIGNATURE and records each call in `calls`. */
    function deviceWith(app: LedgerApp, calls: string[][]): LedgerDevice {
      const answer = (operation: string) => (path: string, argument: string) => {
        calls.push([operation, path, argument]);
        return Promise.resolve(SIGNATURE);
      };
      return {
        detectApp: () => Promise.resolve(app),
        getPublicKey: (path) => {
          calls.push(["getPublicKey", path]);
          return Promise.resolve(EWOQ_PUBLIC_KEY_COMPRESSED);
        },
        signHash: answer("signHash"),
        signTransaction: answer("signTransaction"),
        signEvmTransaction: answer("signEvmTransaction"),
      };
    }

    const signOn = (app: LedgerApp, json: UnsignedTxJson, calls: string[][]) =>
      new LedgerSigner(deviceWith(app, calls), PATH, "localflare").sign(bundleFromUnsignedTxJson(json));

    it("the Flare app parses and signs the atomic transaction's full unsigned bytes", async () => {
      const calls: string[][] = [];
      expect(await signOn("Flare", atomicJson, calls)).to.deep.equal(SIGNED);
      expect(calls).to.deep.equal([
        ["getPublicKey", PATH],
        ["signTransaction", PATH, atomicJson.unsignedTransactionBuffer],
      ]);
    });

    it("the Avalanche app signs the atomic transaction's digest, the message of its unsigned file", async () => {
      const calls: string[][] = [];
      expect(await signOn("Avalanche", atomicJson, calls)).to.deep.equal(SIGNED);
      expect(calls).to.deep.equal([
        ["getPublicKey", PATH],
        ["signHash", PATH, atomicJson.signatureRequests[0]!.message],
      ]);
    });

    it("the Ethereum app is refused for an atomic transaction, and nothing is signed", async () => {
      const calls: string[][] = [];
      await signOn("Ethereum", atomicJson, calls).then(
        () => expect.fail("the Ethereum app signed an atomic transaction"),
        (error: unknown) => expect((error as Error).message).to.equal(ETHEREUM_APP_P_CHAIN)
      );
      expect(calls).to.deep.equal([["getPublicKey", PATH]]);
    });

    it("every app signs an EVM transaction's unsigned serialization, whose keccak is the file's message", async () => {
      const unsignedSerialized = Transaction.from(evmJson.rawTx).unsignedSerialized.slice(2);
      expect(keccak256(`0x${unsignedSerialized}`)).to.equal(`0x${evmJson.message}`);
      for (const app of ["Flare", "Avalanche", "Ethereum"] as const) {
        const calls: string[][] = [];
        expect(await signOn(app, evmJson, calls), app).to.deep.equal(SIGNED);
        expect(calls, app).to.deep.equal([
          ["getPublicKey", PATH],
          ["signEvmTransaction", PATH, unsignedSerialized],
        ]);
      }
    });
  });

  describe("LedgerSigner and another Ledger connected later", () => {
    const bundle = bundleFromUnsignedTxJson(readGolden("delegate-file").outcome.unsignedTxJson as UnsignedTxJson);
    const OTHER_KEY = new SigningKey(`0x${"11".repeat(32)}`).compressedPublicKey.slice(2);

    /** A device answering `key.current`, which the test changes to plug in another Ledger; records what it signs. */
    function swappableDevice(key: { current: string }): { device: LedgerDevice; signed: string[] } {
      const signed: string[] = [];
      const device: LedgerDevice = {
        detectApp: () => Promise.resolve("Flare"),
        getPublicKey: () => Promise.resolve(key.current),
        signHash: (_path, hashHex) => {
          signed.push(hashHex);
          return Promise.resolve("ab".repeat(65));
        },
        signTransaction: (_path, txHex) => {
          signed.push(txHex);
          return Promise.resolve("ab".repeat(65));
        },
        signEvmTransaction: (_path, txHex) => {
          signed.push(txHex);
          return Promise.resolve("ab".repeat(65));
        },
      };
      return { device, signed };
    }

    it("keeps answering the account it first read while the device has its key", async () => {
      const key = { current: EWOQ_PUBLIC_KEY_COMPRESSED };
      const { device, signed } = swappableDevice(key);
      const signer = new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare");
      const first = await signer.account();
      expect(await signer.account()).to.equal(first);
      expect((await signer.sign(bundle)).status).to.equal("signed");
      expect(signed).to.have.length(1);
    });

    it("refuses the account and signs nothing once another key answers", async () => {
      const key = { current: EWOQ_PUBLIC_KEY_COMPRESSED };
      const { device, signed } = swappableDevice(key);
      const signer = new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare");
      const first = await signer.account();
      key.current = OTHER_KEY;
      const refusal =
        /^The connected Ledger has 0x[0-9a-fA-F]{40} at m\/44'\/60'\/0'\/0\/0, not 0x[0-9a-fA-F]{40} as when it was connected; reconnect that Ledger$/;
      await signer.account().then(
        () => expect.fail("answered another account"),
        (error: unknown) => {
          expect((error as Error).message).to.match(refusal);
          expect((error as Error).message).to.include(`not ${first.cAddress} `);
        }
      );
      await signer.sign(bundle).then(
        () => expect.fail("signed with another Ledger"),
        (error: unknown) => expect((error as Error).message).to.match(refusal)
      );
      expect(signed).to.deep.equal([]);
      key.current = EWOQ_PUBLIC_KEY_COMPRESSED; // the first Ledger back: accepted again
      expect(await signer.account()).to.equal(first);
    });

    it("given the key the account was chosen by, refuses even the first read of another key", async () => {
      const key = { current: OTHER_KEY };
      const { device, signed } = swappableDevice(key);
      // as a ctx.json may hold it: uncompressed, with 0x
      const expected = new SigningKey(`0x${EWOQ_PRIVATE_KEY_HEX}`).publicKey;
      const signer = new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare", expected);
      await signer.account().then(
        () => expect.fail("answered another account"),
        (error: unknown) => expect((error as Error).message).to.match(/^The connected Ledger has 0x[0-9a-fA-F]{40} /)
      );
      await signer.sign(bundle).then(
        () => expect.fail("signed with another Ledger"),
        (error: unknown) => expect((error as Error).message).to.match(/^The connected Ledger has /)
      );
      expect(signed).to.deep.equal([]);
      key.current = EWOQ_PUBLIC_KEY_COMPRESSED;
      expect((await signer.account()).publicKeyHex).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
    });
  });
});
