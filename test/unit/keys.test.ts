import { expect } from "chai";
import { SigningKey, getBytes } from "ethers";
import { secp256k1, utils as futils } from "@flarenetwork/flarejs";
import {
  accountFromPrivateKey,
  accountFromPublicKey,
  normalizePublicKey,
  parsePrivateKey,
  privateKeyToCb58,
} from "../../src/chain/keys";
import {
  EWOQ_ETH_ADDRESS,
  EWOQ_P_ADDRESS,
  EWOQ_PRIVATE_KEY_CB58,
  EWOQ_PRIVATE_KEY_HEX,
  EWOQ_PUBLIC_KEY_COMPRESSED,
} from "../helpers/keys";

describe("chain/keys", () => {
  const privateKey = getBytes("0x" + EWOQ_PRIVATE_KEY_HEX);

  it("derives the ewoq account from the private key", () => {
    const account = accountFromPrivateKey(privateKey, "localflare");
    expect(account.publicKeyHex).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
    expect(account.cAddress).to.equal(EWOQ_ETH_ADDRESS);
    expect(account.pAddress).to.equal(EWOQ_P_ADDRESS);
    expect(account.cAddressBech).to.equal("C-" + EWOQ_P_ADDRESS.slice(2));
    expect(account.addressBytes.length).to.equal(20);
    expect(Buffer.from(account.cAddressBytes).toString("hex")).to.equal(EWOQ_ETH_ADDRESS.slice(2).toLowerCase());
  });

  it("accepts compressed, uncompressed and raw x||y public keys, with or without 0x", () => {
    const raw = SigningKey.computePublicKey("0x" + EWOQ_PRIVATE_KEY_HEX, false).slice(4); // x||y without the 04 prefix
    const expectedFlareP =
      "P-" +
      futils.formatBech32("flare", secp256k1.publicKeyBytesToAddress(getBytes("0x" + EWOQ_PUBLIC_KEY_COMPRESSED)));
    for (const form of [EWOQ_PUBLIC_KEY_COMPRESSED, "0x" + EWOQ_PUBLIC_KEY_COMPRESSED, raw, "04" + raw, "0x04" + raw]) {
      const account = accountFromPublicKey(form, "flare");
      expect(account.publicKeyHex, form.slice(0, 12)).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
      expect(account.cAddress).to.equal(EWOQ_ETH_ADDRESS);
      expect(account.pAddress).to.equal(expectedFlareP);
    }
  });

  it("rejects malformed public keys", () => {
    for (const bad of ["", "zz", "02" + "00".repeat(32), "03" + "ff".repeat(32), "0x1234"]) {
      expect(() => normalizePublicKey(bad), bad).to.throw(/Invalid public key/);
    }
  });

  it("keeps the library's error as the cause of a key that is not on the curve", () => {
    const notOnCurve = "02" + "00".repeat(32);
    let library: unknown;
    try {
      SigningKey.computePublicKey("0x" + notOnCurve, true);
    } catch (error) {
      library = error;
    }
    expect(library).to.be.instanceOf(Error);
    expect(() => normalizePublicKey(notOnCurve))
      .to.throw(`Invalid public key: ${(library as Error).message}`)
      .with.property("cause")
      .that.is.instanceOf(Error)
      .and.has.property("message", (library as Error).message);
  });

  it("reads hex and cb58 private keys and checks they agree", () => {
    expect(parsePrivateKey({ hex: EWOQ_PRIVATE_KEY_HEX })).to.deep.equal(privateKey);
    expect(parsePrivateKey({ hex: "0x" + EWOQ_PRIVATE_KEY_HEX })).to.deep.equal(privateKey);
    expect(parsePrivateKey({ cb58: EWOQ_PRIVATE_KEY_CB58 })).to.deep.equal(privateKey);
    expect(parsePrivateKey({ cb58: EWOQ_PRIVATE_KEY_CB58.replace("PrivateKey-", "") })).to.deep.equal(privateKey);
    expect(parsePrivateKey({ hex: EWOQ_PRIVATE_KEY_HEX, cb58: EWOQ_PRIVATE_KEY_CB58 })).to.deep.equal(privateKey);
    expect(privateKeyToCb58(privateKey)).to.equal(EWOQ_PRIVATE_KEY_CB58);
    expect(() => parsePrivateKey({})).to.throw(/No private key/);
    expect(() => parsePrivateKey({ hex: "1234" })).to.throw(/32 bytes/);
    expect(() => parsePrivateKey({ cb58: "not-base58!" })).to.throw(/base58check/);
    expect(() => parsePrivateKey({ hex: "11".repeat(32), cb58: EWOQ_PRIVATE_KEY_CB58 })).to.throw(/different keys/);
  });
});
