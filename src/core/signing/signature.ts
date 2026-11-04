import { secp256k1 } from "@flarenetwork/flarejs";
import { getBytes, hexlify } from "ethers";

export const SIGNATURE_LENGTH = 65;

/**
 * Normalizes a 65-byte r|s|v signature so that v is the recovery id (0 or 1),
 * whichever convention the signer used: 0/1 (flarejs, noble), 27/28 (Ledger,
 * eth_sign) or EIP-155 (35 + chainId*2 + parity).
 */
export function normalizeSignature(signature: Uint8Array | string): Uint8Array {
  const bytes =
    typeof signature === "string"
      ? getBytes(signature.startsWith("0x") ? signature : `0x${signature}`)
      : Uint8Array.from(signature);
  if (bytes.length !== SIGNATURE_LENGTH) {
    throw new Error(`Invalid signature length: ${bytes.length} bytes, expected ${SIGNATURE_LENGTH}`);
  }
  const v = bytes[SIGNATURE_LENGTH - 1]!;
  let recoveryId: number;
  if (v === 0 || v === 1) recoveryId = v;
  else if (v === 27 || v === 28) recoveryId = v - 27;
  else if (v >= 35) recoveryId = (v - 35) % 2;
  else throw new Error(`Invalid signature recovery id: ${v}`);
  const normalized = Uint8Array.from(bytes);
  normalized[SIGNATURE_LENGTH - 1] = recoveryId;
  return normalized;
}

/** Compressed public key recovered from a signature over `digest`. */
export function recoverPublicKey(digest: Uint8Array, signature: Uint8Array): Uint8Array {
  return secp256k1.recoverPublicKey(digest, normalizeSignature(signature));
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export const toHex = (bytes: Uint8Array): string => hexlify(bytes).slice(2);
