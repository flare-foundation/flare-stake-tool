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
import { checkFlareResponse } from "../../src/ledger/flare";
import { checkDerivationPath } from "../../src/ledger/path";
import { ETHEREUM_APP_P_CHAIN, detectApp } from "../../src/ledger/index";
import { NODE_HID_NOT_BUILT, openTransport, type HidTransport } from "../../src/ledger/transport";
import { SigningKey, Transaction, computeAddress, getBytes, keccak256 } from "ethers";
import {
  bundleFromUnsignedTxJson,
  type UnsignedAtomicTxJson,
  type UnsignedEvmTxJson,
  type UnsignedTxJson,
} from "../../src/core/files";
import {
  FAKE_LEDGER_KEY_ENV,
  LedgerSigner,
  confirmLedgerAccount,
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

  it("checkFlareResponse accepts the success status whatever its text, and refuses any other status", () => {
    for (const errorMessage of ["No errors", "", "unexpected"]) {
      expect(() => checkFlareResponse({ returnCode: 0x9000, errorMessage }, "Failed"), errorMessage).not.to.throw();
    }
    expect(() =>
      checkFlareResponse({ returnCode: 0x6986, errorMessage: "No errors" }, "Failed to sign message on ledger")
    ).to.throw("Failed to sign message on ledger: No errors, code 27014");
    expect(() => checkFlareResponse({ returnCode: 0x6984, errorMessage: "Data is invalid" }, "Failed")).to.throw(
      "Failed: Data is invalid, code 27012"
    );
  });

  describe("checkDerivationPath", () => {
    it("accepts m/ and decimal indices below 2^31, hardened or not, whatever their number", () => {
      for (const good of [
        "m/44'/60'/0'/0/0",
        "m/44'/60'/0'/0/10",
        "m/44'/60'/7'/0/0",
        "m/44'/60'/0'/0/0/1", // six: the Flare app takes it
        "m/44'/60'/2147483647'/0/2147483647",
        "m/0",
      ]) {
        expect(checkDerivationPath(good, "--derivation-path"), good).to.equal(good);
      }
    });

    it("refuses what an app would read as another index, or not at all", () => {
      for (const bad of [
        "m/44'/60'/0'/0/1O", // hw-app-eth: index 1
        "m/44'/60'/0'/0/1e1", // hw-app-eth: 1, the others: 10
        "m/44'/60'/0'/0/2147483648",
        "m/44'/60'/0'/0/0x10",
        "m/44'/60'/0'/0/+1",
        "m/44'/60'/0'/0/ 1",
        "m/44'//0'/0/0",
        "m/44h/60'/0'/0/0",
        "M/44'/60'/0'/0/0",
        "44'/60'/0'/0/0",
        "m/",
        "m",
        "",
      ]) {
        expect(() => checkDerivationPath(bad, "--derivation-path"), bad).to.throw(
          `Invalid derivation path "${bad}" (--derivation-path): expected m/ and decimal indices below 2^31`
        );
      }
    });
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

  describe("openTransport", () => {
    const transport = {} as HidTransport;

    it("says how to build node-hid when its binary is missing, keeping the original error as cause", async () => {
      const missing = new Error(
        "Could not locate the bindings file. Tried:\n → /lib/node_modules/node-hid/build/HID.node\n → /lib/node_modules/node-hid/build/Release/HID.node"
      );
      await openTransport(() => Promise.reject(missing)).then(
        () => expect.fail("opened without a binary"),
        (error: unknown) => {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal(NODE_HID_NOT_BUILT);
          expect((error as Error).message).to.include("npm rebuild node-hid --global --ignore-scripts=false");
          expect((error as Error).message).not.to.include("HID.node");
          expect((error as Error).cause).to.equal(missing);
        }
      );
    });

    it("passes any other error through unchanged, and an opened transport too", async () => {
      const other = new Error("cannot open device with path IOService:/AppleARMPE/arm-io");
      await openTransport(() => Promise.reject(other)).then(
        () => expect.fail("opened"),
        (error: unknown) => expect(error).to.equal(other)
      );
      const mentionsIt = new Error("Ledger: Could not locate the bindings file, said another layer");
      await openTransport(() => Promise.reject(mentionsIt)).then(
        () => expect.fail("opened"),
        (error: unknown) => expect(error).to.equal(mentionsIt)
      );
      expect(await openTransport(() => Promise.resolve(transport))).to.equal(transport);
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

    it("shows the C-chain address of its key, as a device that has it would", async () => {
      expect(await fakeLedgerDevice(key).showCAddress("m/44'/60'/0'/0/0")).to.equal(
        computeAddress(`0x${EWOQ_PUBLIC_KEY_COMPRESSED}`)
      );
    });

    it("refuses a malformed key with a fixed message that holds neither the value nor a cause quoting it", () => {
      const original = console.error;
      console.error = () => undefined;
      try {
        const order = "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141";
        for (const bad of [`${EWOQ_PRIVATE_KEY_HEX}zz`, EWOQ_PRIVATE_KEY_HEX.slice(2), "00".repeat(32), order, "x"]) {
          let error: unknown;
          try {
            ledgerDevice({ [FAKE_LEDGER_KEY_ENV]: bad });
          } catch (caught) {
            error = caught;
          }
          expect(error, bad).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal(
            `${FAKE_LEDGER_KEY_ENV} is not a private key (32 bytes of hex); its value is not shown`
          );
          expect((error as Error).cause, bad).to.equal(undefined);
        }
        // a trailing newline, as a shell may leave, or 0x, still names the key
        for (const good of [`${EWOQ_PRIVATE_KEY_HEX}\n`, `0x${EWOQ_PRIVATE_KEY_HEX}`]) {
          expect(() => ledgerDevice({ [FAKE_LEDGER_KEY_ENV]: good }), JSON.stringify(good)).not.to.throw();
        }
      } finally {
        console.error = original;
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
        showCAddress: () => Promise.reject(new Error("not used")),
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
      const stderr: string[] = [];
      const original = console.error;
      console.error = (message: unknown) => stderr.push(String(message));
      let stdout: string;
      try {
        stdout = await logged(async () => {
          result = await new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare").sign(bundle);
        });
      } finally {
        console.error = original;
      }
      expect(result).to.deep.equal({ status: "signed", signature: getBytes(`0x${HASH_SIGNATURE}`) });
      expect(signedHashes).to.deep.equal([Buffer.from(bundle.digest).toString("hex")]);
      // on stderr with the other signing lines: stdout holds the result a script reads
      expect(stderr.join("\n")).to.include(
        "does not recognise delegate transactions; signing the transaction hash instead"
      );
      expect(stdout).to.equal("");
    });

    it("prints the digest on stderr before the fallback has the device sign it", async () => {
      const { device } = flareApp(invalidData("Unrecognized error code"));
      const events: string[] = [];
      const signHash = device.signHash.bind(device);
      device.signHash = (path, hashHex) => {
        events.push(`signHash ${hashHex}`);
        return signHash(path, hashHex);
      };
      const original = console.error;
      console.error = (message: unknown) => events.push(`stderr ${String(message)}`);
      try {
        await logged(() => new LedgerSigner(device, "m/44'/60'/0'/0/0", "localflare").sign(bundle));
      } finally {
        console.error = original;
      }
      const digest = Buffer.from(bundle.digest).toString("hex");
      expect(events).to.have.length(3);
      expect(events[0]).to.include("does not recognise delegate transactions");
      expect(events[1]).to.include(`Blind signing: the Ledger signs the transaction hash ${digest};`);
      expect(events[2]).to.equal(`signHash ${digest}`);
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
        showCAddress: (path) => {
          calls.push(["showCAddress", path]);
          return Promise.reject(new Error("showCAddress called while signing"));
        },
      };
    }

    /** Signs `json` with `app` open; device calls and stderr lines go to `calls` in the order they happen. */
    async function signOn(app: LedgerApp, json: UnsignedTxJson, calls: string[][]): Promise<unknown> {
      const original = console.error;
      console.error = (message: unknown) => calls.push(["stderr", String(message)]);
      try {
        return await new LedgerSigner(deviceWith(app, calls), PATH, "localflare").sign(bundleFromUnsignedTxJson(json));
      } finally {
        console.error = original;
      }
    }

    it("the Flare app parses and signs the atomic transaction's full unsigned bytes", async () => {
      const calls: string[][] = [];
      expect(await signOn("Flare", atomicJson, calls)).to.deep.equal(SIGNED);
      expect(calls).to.deep.equal([
        ["getPublicKey", PATH],
        ["signTransaction", PATH, atomicJson.unsignedTransactionBuffer],
      ]);
    });

    it("the Avalanche app signs the atomic transaction's digest, the message of its unsigned file, printed first", async () => {
      const message = atomicJson.signatureRequests[0]!.message;
      const calls: string[][] = [];
      expect(await signOn("Avalanche", atomicJson, calls)).to.deep.equal(SIGNED);
      expect(calls.map(([operation]) => operation)).to.deep.equal(["getPublicKey", "stderr", "signHash"]);
      expect(calls[1]![1]).to.include(`Blind signing: the Ledger signs the transaction hash ${message};`);
      expect(calls[2]).to.deep.equal(["signHash", PATH, message]);
    });

    it("the Ethereum app is refused for an atomic transaction, and nothing is signed", async () => {
      const calls: string[][] = [];
      await signOn("Ethereum", atomicJson, calls).then(
        () => expect.fail("the Ethereum app signed an atomic transaction"),
        (error: unknown) => expect((error as Error).message).to.equal(ETHEREUM_APP_P_CHAIN)
      );
      expect(calls).to.deep.equal([["getPublicKey", PATH]]);
      // the Flare app reads the transaction on the device; on localflare, whose network it doesn't know, only the
      // Avalanche app can sign
      expect(ETHEREUM_APP_P_CHAIN).to.include("open the Flare app");
      expect(ETHEREUM_APP_P_CHAIN).to.include("on localflare, the Avalanche app");
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

  describe("confirmLedgerAccount, for init-ctx --ledger", () => {
    const PATH = "m/44'/60'/0'/0/4";
    const ewoqAddress = computeAddress(`0x${EWOQ_PUBLIC_KEY_COMPRESSED}`);

    /** Confirms on a device with the ewoq key that shows `shown`; device calls and stderr lines go to `events`. */
    async function confirm(shown: string, events: string[]): ReturnType<typeof confirmLedgerAccount> {
      const device: LedgerDevice = {
        detectApp: () => Promise.resolve("Flare"),
        getPublicKey: (path) => {
          events.push(`getPublicKey ${path}`);
          return Promise.resolve(EWOQ_PUBLIC_KEY_COMPRESSED);
        },
        signHash: () => Promise.reject(new Error("not used")),
        signTransaction: () => Promise.reject(new Error("not used")),
        signEvmTransaction: () => Promise.reject(new Error("not used")),
        showCAddress: (path) => {
          events.push(`showCAddress ${path}`);
          return Promise.resolve(shown);
        },
      };
      const original = console.error;
      console.error = (message: unknown) => events.push(`stderr ${String(message)}`);
      try {
        return await confirmLedgerAccount(device, PATH, "costwo");
      } finally {
        console.error = original;
      }
    }

    it("prints the address before the device shows it, and returns the key as the device returned it", async () => {
      const events: string[] = [];
      const { publicKey, account } = await confirm(ewoqAddress, events);
      expect(publicKey).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
      expect(account.cAddress).to.equal(ewoqAddress);
      expect(events).to.have.length(3);
      expect(events[0]).to.equal(`getPublicKey ${PATH}`);
      expect(events[1]).to.include(
        `Check that the Ledger shows the address ${ewoqAddress} at ${PATH}, then approve it`
      );
      expect(events[2]).to.equal(`showCAddress ${PATH}`);
    });

    it("accepts the address the device shows in lowercase", async () => {
      expect((await confirm(ewoqAddress.toLowerCase(), [])).account.cAddress).to.equal(ewoqAddress);
    });

    it("refuses another address, or an answer that is not an address", async () => {
      const otherAddress = computeAddress(new SigningKey(`0x${"11".repeat(32)}`));
      for (const shown of [otherAddress, ewoqAddress.slice(0, -1), "", "not an address"]) {
        await confirm(shown, []).then(
          () => expect.fail(`accepted ${shown}`),
          (error: unknown) =>
            expect((error as Error).message, shown).to.equal(
              `The Ledger shows ${shown} at ${PATH}, not ${ewoqAddress}, the address of the public key it returned; ` +
                "no context file was written"
            )
        );
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
        showCAddress: () => Promise.reject(new Error("not used")),
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
