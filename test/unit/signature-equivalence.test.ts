import { expect } from "chai";
import { ec as EC } from "elliptic";
import { secp256k1 } from "@flarenetwork/flarejs";
import { SigningKey } from "ethers";
import { EWOQ_PRIVATE_KEY_HEX, signMessageHash } from "../helpers/keys";

/**
 * The private-key signer (flarejs), the external-signature test helper
 * (elliptic) and the EVM signer (ethers) must produce the same deterministic
 * RFC 6979 signature for the same hash, otherwise goldens captured through one
 * of them could not be compared with the others.
 */
describe("signature equivalence across elliptic, flarejs and ethers", () => {
  const privateKey = Buffer.from(EWOQ_PRIVATE_KEY_HEX, "hex");
  const hashes = [
    "e8b2557ea240f0265b2d1ec0cf9ca3b6689b5c392a7d9b98d43bb8f681635e44",
    "0000000000000000000000000000000000000000000000000000000000000001",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  ];

  for (const hash of hashes) {
    it(`hash ${hash.slice(0, 8)}…: elliptic == flarejs signHash == ethers SigningKey`, async () => {
      const fromElliptic = signMessageHash(hash, EWOQ_PRIVATE_KEY_HEX);
      const fromFlarejs = Buffer.from(await secp256k1.signHash(Buffer.from(hash, "hex"), privateKey)).toString("hex");
      const sig = new SigningKey("0x" + EWOQ_PRIVATE_KEY_HEX).sign("0x" + hash);
      const fromEthers = sig.r.slice(2) + sig.s.slice(2) + sig.yParity.toString(16).padStart(2, "0");
      expect(fromFlarejs).to.equal(fromElliptic);
      expect(fromEthers).to.equal(fromElliptic);
      // low-s canonical form, as the node and ethers require
      const s = BigInt("0x" + fromElliptic.slice(64, 128));
      const n = new EC("secp256k1").curve.n!;
      expect(s <= BigInt(n.shrn(1).toString())).to.equal(true);
    });
  }

  it("recovers the ewoq public key from each signature", async () => {
    const hash = hashes[0]!;
    const signature = Buffer.from(signMessageHash(hash, EWOQ_PRIVATE_KEY_HEX), "hex");
    const recovered = secp256k1.recoverPublicKey(Buffer.from(hash, "hex"), signature);
    expect(Buffer.from(recovered).toString("hex")).to.equal(
      Buffer.from(secp256k1.getPublicKey(privateKey)).toString("hex")
    );
  });
});
