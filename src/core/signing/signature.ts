import { secp256k1 } from "@flarenetwork/flarejs";
import { getBytes, hexlify } from "ethers";

export const SIGNATURE_LENGTH = 65;

/** The order n of secp256k1: a signature's r and s lie in [1, n). */
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * Normalizes a 65-byte r|s|v signature so that v is the recovery id (0 or 1),
 * whichever convention the signer used: 0/1 (flarejs, noble), 27/28 (Ledger,
 * eth_sign) or EIP-155 (35 + chainId*2 + parity), and so that s is the low one
 * the node and ethers require: a signer that leaves s above n/2 (Go
 * crypto/ecdsa, a KMS) signed the same as with n − s and the other recovery id.
 * An r or s of 0 or not below n is refused.
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
  const r = BigInt(hexlify(bytes.subarray(0, 32)));
  const s = BigInt(hexlify(bytes.subarray(32, 64)));
  for (const [name, value] of [
    ["r", r],
    ["s", s],
  ] as const) {
    if (value === 0n || value >= CURVE_ORDER) {
      throw new Error(`Invalid signature: its ${name} is 0 or not below the curve order`);
    }
  }
  const normalized = Uint8Array.from(bytes);
  if (s > CURVE_ORDER / 2n) {
    normalized.set(getBytes(`0x${(CURVE_ORDER - s).toString(16).padStart(64, "0")}`), 32);
    recoveryId ^= 1;
  }
  normalized[SIGNATURE_LENGTH - 1] = recoveryId;
  return normalized;
}

/** The error of a signature from which no public key recovers. */
export const UNRECOVERABLE_SIGNATURE =
  "The signature is not a valid signature of this transaction (no key recovers from it)";

/** Compressed public key recovered from a signature over `digest`. */
export function recoverPublicKey(digest: Uint8Array, signature: Uint8Array): Uint8Array {
  const normalized = normalizeSignature(signature);
  try {
    return secp256k1.recoverPublicKey(digest, normalized);
  } catch (error) {
    throw new Error(UNRECOVERABLE_SIGNATURE, { cause: error });
  }
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export const toHex = (bytes: Uint8Array): string => hexlify(bytes).slice(2);
