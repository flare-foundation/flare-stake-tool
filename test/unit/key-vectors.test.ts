import { expect } from "chai";
import { secp256k1, utils as futils } from "@flarenetwork/flarejs";
import { SigningKey, computeAddress, getAddress } from "ethers";
import { EWOQ_ETH_ADDRESS, EWOQ_P_ADDRESS, EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

/**
 * Pins the key/address derivation on known vectors so the elliptic +
 * ethereumjs-util + bech32 code can be replaced by flarejs/ethers without a
 * behaviour change. Every library in use today and every candidate must agree.
 */
describe("key and address vectors (ewoq)", () => {
  const privateKey = Buffer.from(EWOQ_PRIVATE_KEY_HEX, "hex");

  it("flarejs secp256k1 + utils derive the same values ", () => {
    const publicKey = secp256k1.getPublicKey(privateKey);
    expect(Buffer.from(publicKey).toString("hex")).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
    const addressBytes = secp256k1.publicKeyBytesToAddress(publicKey);
    expect(`P-${futils.formatBech32("localflare", addressBytes)}`).to.equal(EWOQ_P_ADDRESS);
    expect(Buffer.from(futils.bech32ToBytes(EWOQ_P_ADDRESS)).equals(Buffer.from(addressBytes))).to.equal(true);
    const ethAddress = "0x" + Buffer.from(secp256k1.publicKeyToEthAddress(publicKey)).toString("hex");
    expect(ethAddress.toLowerCase()).to.equal(EWOQ_ETH_ADDRESS.toLowerCase());
  });

  it("ethers derives the same C-address with EIP-55 checksum ", () => {
    const signingKey = new SigningKey("0x" + EWOQ_PRIVATE_KEY_HEX);
    expect(signingKey.compressedPublicKey.slice(2)).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
    expect(computeAddress(signingKey.publicKey)).to.equal(EWOQ_ETH_ADDRESS);
    expect(getAddress(EWOQ_ETH_ADDRESS.toLowerCase())).to.equal(EWOQ_ETH_ADDRESS);
    // uncompressed -> compressed, as init-ctx accepts both forms
    expect(SigningKey.computePublicKey(signingKey.publicKey, true).slice(2)).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
  });
});
