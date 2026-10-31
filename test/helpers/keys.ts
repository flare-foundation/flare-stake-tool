import { ec as EC } from "elliptic";

// Publicly known Avalanche test private key ("ewoq"), funded in the built-in
// localflare genesis on both the C-chain and the P-chain.
// SAFE FOR LOCAL TEST NETWORKS ONLY.
export const EWOQ_PRIVATE_KEY_HEX = "56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027";
export const EWOQ_PRIVATE_KEY_CB58 = "PrivateKey-ewoqjP7PxY4yr3iLTpLisriqt94hdyDFNgchSxGGztUrTXtNN";
export const EWOQ_ETH_ADDRESS = "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC";
export const EWOQ_PUBLIC_KEY_COMPRESSED = "0327448e78ffa8cdb24cf19be0204ad954b1bdb4db8c51183534c1eecf2ebd094e";
export const EWOQ_P_ADDRESS = "P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v";

const secp256k1 = new EC("secp256k1");

/**
 * Signs a 32-byte message hash (hex, no 0x) the way an external signer would for
 * the unsigned-file flow: 65 bytes r|s|v hex with v = recovery id (00/01).
 */
export function signMessageHash(messageHashHex: string, privKeyHex: string = EWOQ_PRIVATE_KEY_HEX): string {
  const keyPair = secp256k1.keyFromPrivate(privKeyHex, "hex");
  const sig = keyPair.sign(messageHashHex, { canonical: true });
  const r = sig.r.toString("hex").padStart(64, "0");
  const s = sig.s.toString("hex").padStart(64, "0");
  const v = (sig.recoveryParam ?? 0).toString(16).padStart(2, "0");
  return r + s + v;
}
