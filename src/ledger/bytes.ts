/** Hex/bytes helpers and signature shapes for the Ledger device code. */
import type { Signature } from "./interfaces";

export function toHex(value: string | number | Buffer | Uint8Array, prefix0x: boolean = true): string {
  let hex: string;
  if (typeof value === "string") {
    hex = value.startsWith("0x") ? value.slice(2) : value;
  } else if (typeof value === "number") {
    hex = value.toString(16);
  } else {
    hex = Buffer.from(value).toString("hex");
  }
  return prefix0x ? `0x${hex}` : hex;
}

export function toBuffer(value: string | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(toHex(value, false), "hex");
  return Buffer.from(value);
}

/** r|s|v hex of a device signature given as separate byte buffers (Flare and Avalanche apps). */
export function rsvHex(signature: { r?: Buffer; s?: Buffer; v?: Buffer }, what: string): string {
  if (!signature.r || !signature.s || !signature.v) {
    throw new Error(`Failed to get the signature of ${what} from the Ledger device`);
  }
  return Buffer.concat([signature.r, signature.s, signature.v]).toString("hex");
}

/**
 * r|s|v hex, with v as 27/28, of an Ethereum-style device signature whose v
 * may come back as the recovery id (0/1), as 27/28, or EIP-155 encoded
 * (35 + 2 * chainId + recovery id), as a hex string or a number.
 */
export function evmSignatureHex(signature: Signature): string {
  const { r, s, v } = signature;
  if (!r || !s || v === undefined || v === null || v === "") {
    throw new Error("Failed to get the signature from the Ledger device");
  }
  const recovery = recoveryV(typeof v === "number" ? v : parseInt(toHex(v, false), 16));
  if (recovery === undefined) {
    // no signature has such a v; up to 5.0.0 it became a malformed signature
    throw new Error(`Invalid signature v from the Ledger device: ${String(v)}`);
  }
  return toHex(r, false) + toHex(s, false) + recovery.toString(16);
}

/** 27/28 for a device's v: the recovery id (0/1), already 27/28, or EIP-155 (35 + 2 * chainId + recovery id). */
function recoveryV(v: number): 27 | 28 | undefined {
  if (v === 0 || v === 1) return v === 0 ? 27 : 28;
  if (v === 27 || v === 28) return v;
  if (v >= 35) return v % 2 === 1 ? 27 : 28;
  return undefined;
}
