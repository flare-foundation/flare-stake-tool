/** Minimal hex/bytes helpers for the Ledger device code. */
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
