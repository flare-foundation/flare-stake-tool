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
    expect(() => normalizeSignature(rs + "05")).to.throw(/recovery id/);
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
