import { expect } from "chai";
import { SigningKey, getBytes } from "ethers";
import { secp256k1, utils as futils } from "@flarenetwork/flarejs";
import {
  accountFromPrivateKey,
  accountFromPublicKey,
  normalizePublicKey,
  pChainAddressBytes,
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

  it("reads a P-chain address of the selected network only", () => {
    const account = accountFromPrivateKey(privateKey, "localflare");
    expect(pChainAddressBytes(EWOQ_P_ADDRESS, "localflare")).to.deep.equal(account.addressBytes);
    // the same key on another network, or in its C-chain form, has the same address bytes
    const costwo = `P-${futils.formatBech32("costwo", account.addressBytes)}`;
    expect(() => pChainAddressBytes(costwo, "localflare")).to.throw(
      `"${costwo}" is an address of costwo, not of this network (localflare): expected P-localflare1…`
    );
    expect(() => pChainAddressBytes(account.cAddressBech, "localflare")).to.throw(
      `"${account.cAddressBech}" is not a P-chain address: expected P-localflare1…`
    );
    // empty, not bech32, without the chain prefix, and with a wrong checksum
    for (const bad of ["", "P-x", EWOQ_P_ADDRESS.slice(2), EWOQ_P_ADDRESS.slice(0, -1) + "q"]) {
      expect(() => pChainAddressBytes(bad, "localflare"), bad).to.throw(
        `Invalid P-chain address "${bad}": expected P-localflare1…`
      );
    }
    const long = `P-${futils.formatBech32("localflare", new Uint8Array(32))}`;
    expect(() => pChainAddressBytes(long, "localflare")).to.throw(
      `Invalid P-chain address "${long}": it holds 32 bytes, not 20`
    );
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
    const short = futils.base58check.encode(new Uint8Array(31).fill(1));
    expect(() => parsePrivateKey({ cb58: `PrivateKey-${short}` })).to.throw("PRIVATE_KEY_CB58 must decode to 32 bytes");
    expect(() => parsePrivateKey({ hex: "11".repeat(32), cb58: EWOQ_PRIVATE_KEY_CB58 })).to.throw(/different keys/);
  });

  it("refuses a cb58 private key with any one character mistyped", () => {
    // flarejs' base58check.decode never checks the checksum: most of these decoded to another, valid key
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const encoded = EWOQ_PRIVATE_KEY_CB58.replace("PrivateKey-", "");
    for (let i = 0; i < encoded.length; i++) {
      const typo = alphabet[(alphabet.indexOf(encoded[i]!) + 1) % alphabet.length]!;
      const mistyped = `PrivateKey-${encoded.slice(0, i)}${typo}${encoded.slice(i + 1)}`;
      expect(() => parsePrivateKey({ cb58: mistyped }), mistyped).to.throw(
        "PRIVATE_KEY_CB58 has a bad checksum; check it for a typo"
      );
    }
  });
});
