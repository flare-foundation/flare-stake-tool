import { expect } from "chai";
import fc from "fast-check";
import { getBytes } from "ethers";
import { SIGNATURE_LENGTH, normalizeSignature, recoverPublicKey, toHex } from "../../src/core/signing/signature";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "../helpers/keys";

describe("core/signing/signature", () => {
  const hash = "e8b2557ea240f0265b2d1ec0cf9ca3b6689b5c392a7d9b98d43bb8f681635e44";
  const canonical = signMessageHash(hash, EWOQ_PRIVATE_KEY_HEX); // v = 00 or 01
  const rs = canonical.slice(0, 128);
  const recoveryId = parseInt(canonical.slice(128), 16);

  it("accepts v as 0/1, 27/28 and EIP-155 and returns the recovery id", () => {
    for (const [input, expected] of [
      [rs + recoveryId.toString(16).padStart(2, "0"), recoveryId],
      [rs + (recoveryId + 27).toString(16), recoveryId],
      [rs + (35 + 2 * 14 + recoveryId).toString(16), recoveryId], // flare chain id
      ["0x" + rs + (recoveryId + 27).toString(16), recoveryId],
    ] as const) {
      const normalized = normalizeSignature(input);
      expect(normalized.length).to.equal(SIGNATURE_LENGTH);
      expect(normalized[64]).to.equal(expected);
      expect(toHex(normalized).slice(0, 128)).to.equal(rs);
    }
  });

  it("rejects wrong lengths and impossible recovery ids", () => {
    expect(() => normalizeSignature("deadbeef")).to.throw(/Invalid signature length/);
    expect(() => normalizeSignature(canonical + "00")).to.throw(/Invalid signature length/); // 66 bytes
    expect(() => normalizeSignature(rs + "05")).to.throw(/recovery id/);
  });

  it("turns a high s into the low one with the other recovery id, the same signature for the same key", () => {
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const s = BigInt(`0x${rs.slice(64)}`);
    const highS = (n - s).toString(16).padStart(64, "0");
    for (const v of [recoveryId ^ 1, (recoveryId ^ 1) + 27]) {
      const twin = rs.slice(0, 64) + highS + v.toString(16).padStart(2, "0");
      expect(toHex(normalizeSignature(twin)), `v ${v}`).to.equal(canonical);
      expect(toHex(recoverPublicKey(getBytes("0x" + hash), getBytes("0x" + twin)))).to.equal(
        EWOQ_PUBLIC_KEY_COMPRESSED
      );
    }
  });

  it("refuses an r or s of 0 or not below the curve order, and names a signature no key recovers from", () => {
    const n = "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141";
    const word = (value: string) => value.padStart(64, "0");
    for (const [sig, part] of [
      [word("0") + rs.slice(64) + "00", "r"],
      [rs.slice(0, 64) + word("0") + "00", "s"],
      [n + rs.slice(64) + "00", "r"],
      [rs.slice(0, 64) + "f".repeat(64) + "00", "s"],
    ] as const) {
      expect(() => normalizeSignature(sig)).to.throw(
        `Invalid signature: its ${part} is 0 or not below the curve order`
      );
    }
    // no point on the curve has x = 5: flarejs said only "sqrt invalid"
    expect(() => recoverPublicKey(getBytes("0x" + hash), getBytes("0x" + word("5") + word("1") + "00"))).to.throw(
      "The signature is not a valid signature of this transaction (no key recovers from it)"
    );
  });

  it("recovers the ewoq key from every accepted form", () => {
    for (const v of [recoveryId, recoveryId + 27, 35 + 2 * 19 + recoveryId]) {
      const sig = rs + v.toString(16).padStart(2, "0");
      expect(toHex(recoverPublicKey(getBytes("0x" + hash), normalizeSignature(sig)))).to.equal(
        EWOQ_PUBLIC_KEY_COMPRESSED
      );
    }
  });

  it("is idempotent and chain-id independent (property)", () => {
    fc.assert(
      // a 65-byte signature carries v in one byte, so EIP-155 encoding only fits chain ids up to 109
      fc.property(fc.integer({ min: 0, max: 1 }), fc.integer({ min: 1, max: 109 }), (parity, chainId) => {
        const eip155 = rs + (35 + 2 * chainId + parity).toString(16);
        const normalized = normalizeSignature(eip155);
        expect(normalized[64]).to.equal(parity);
        expect(normalizeSignature(normalized)).to.deep.equal(normalized);
      })
    );
  });
});
