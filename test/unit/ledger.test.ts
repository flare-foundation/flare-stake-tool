/**
 * The Ledger code that runs without a device: signature shapes, the Avalanche
 * app's path split, and the software stand-in used by tests.
 */
import { expect } from "chai";
import fc from "fast-check";
import { evmSignatureHex, rsvHex, toHex } from "../../src/ledger/bytes";
import { splitAvalanchePath } from "../../src/ledger/avalanche";
import { detectApp } from "../../src/ledger/index";
import { FAKE_LEDGER_KEY_ENV, fakeLedgerDevice, ledgerDevice } from "../../src/signers/ledger";
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
});
