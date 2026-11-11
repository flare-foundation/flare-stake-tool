/**
 * Keys and addresses, derived with flarejs' secp256k1 helpers (the same code
 * that signs) and ethers for the EIP-55 C-chain form. Pinned by the ewoq
 * vectors in test/unit/key-vectors.test.ts.
 */
import { secp256k1, utils as futils } from "@flarenetwork/flarejs";
import { SigningKey, computeAddress, getAddress, getBytes, hexlify } from "ethers";

export interface Account {
  /** 33-byte compressed secp256k1 public key; what flarejs' signing helpers expect. */
  readonly publicKey: Uint8Array;
  /** The same key as lowercase hex without 0x, as stored in ctx.json. */
  readonly publicKeyHex: string;
  /** EIP-55 checksummed C-chain address. */
  readonly cAddress: string;
  readonly cAddressBytes: Uint8Array;
  /** "P-<hrp>1…" */
  readonly pAddress: string;
  /** "C-<hrp>1…", the C-chain's bech32 form used by the atomic UTXO APIs. */
  readonly cAddressBech: string;
  /** 20-byte ripemd160(sha256(publicKey)); the owner of every P-chain output. */
  readonly addressBytes: Uint8Array;
}

const strip0x = (hex: string): string => hex.replace(/^0x/i, "");

/**
 * Accepts a compressed (33 bytes), uncompressed (65 bytes, 04-prefixed) or raw
 * x||y (64 bytes) public key, as hex with or without 0x or as bytes, validates
 * it and returns the compressed 33-byte form.
 */
export function normalizePublicKey(input: string | Uint8Array): Uint8Array {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    const hex = strip0x(input.trim());
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      throw new Error("Invalid public key: not a hex string");
    }
    bytes = getBytes("0x" + hex);
  } else {
    bytes = input;
  }
  if (bytes.length === 64) {
    bytes = new Uint8Array([4, ...bytes]);
  }
  if (bytes.length !== 33 && bytes.length !== 65) {
    throw new Error(`Invalid public key: expected 33 or 65 bytes, got ${bytes.length}`);
  }
  try {
    return getBytes(SigningKey.computePublicKey(bytes, true));
  } catch (error) {
    throw new Error(`Invalid public key: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function accountFromPublicKey(publicKey: string | Uint8Array, hrp: string): Account {
  const compressed = normalizePublicKey(publicKey);
  const addressBytes = secp256k1.publicKeyBytesToAddress(compressed);
  const bech32 = futils.formatBech32(hrp, addressBytes);
  const cAddress = getAddress(computeAddress(hexlify(compressed)));
  return {
    publicKey: compressed,
    publicKeyHex: hexlify(compressed).slice(2),
    cAddress,
    cAddressBytes: getBytes(cAddress),
    pAddress: `P-${bech32}`,
    cAddressBech: `C-${bech32}`,
    addressBytes,
  };
}

/**
 * The address bytes of a P-chain address the user gave, checked to belong to the network of `hrp`. The bech32
 * decoding alone keeps only the bytes, so "P-costwo1…" or "C-flare1…" would pay the same key on whichever network
 * is selected.
 */
export function pChainAddressBytes(address: string, hrp: string): Uint8Array {
  const expected = `expected P-${hrp}1…`;
  let parsed: [string, string, Uint8Array];
  try {
    parsed = futils.parse(address.trim());
  } catch {
    throw new Error(`Invalid P-chain address "${address}": ${expected}`);
  }
  const [chain, addressHrp, bytes] = parsed;
  if (chain !== "P") {
    throw new Error(`"${address}" is not a P-chain address: ${expected}`);
  }
  if (addressHrp !== hrp) {
    throw new Error(`"${address}" is an address of ${addressHrp}, not of this network (${hrp}): ${expected}`);
  }
  if (bytes.length !== 20) {
    throw new Error(`Invalid P-chain address "${address}": it holds ${bytes.length} bytes, not 20`);
  }
  return bytes;
}

export function accountFromPrivateKey(privateKey: Uint8Array, hrp: string): Account {
  return accountFromPublicKey(secp256k1.getPublicKey(privateKey), hrp);
}

/**
 * Decodes CB58 (base58 of the bytes followed by the last 4 bytes of their sha256) and checks the checksum. flarejs'
 * `base58check.decode` (and so `NodeId.fromString`) drops those 4 bytes without checking them, so a mistyped
 * character decoded to other, valid bytes. `label` names the value in the errors.
 */
export function decodeCb58(encoded: string, label: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = futils.base58.decode(encoded);
  } catch {
    throw new Error(`${label} is not valid base58check`);
  }
  const bytes = decoded.subarray(0, -4);
  if (hexlify(futils.addChecksum(bytes)) !== hexlify(decoded)) {
    throw new Error(`${label} has a bad checksum; check it for a typo`);
  }
  return bytes;
}

const CB58_PREFIX = "PrivateKey-";

/**
 * Reads a private key from the env-file conventions: `PRIVATE_KEY_HEX` (0x
 * optional) and/or `PRIVATE_KEY_CB58` ("PrivateKey-" prefix optional). When both
 * are present they must agree.
 */
export function parsePrivateKey(options: { hex?: string | undefined; cb58?: string | undefined }): Uint8Array {
  const hex = options.hex?.trim();
  const cb58 = options.cb58?.trim();
  let fromHex: Uint8Array | undefined;
  let fromCb58: Uint8Array | undefined;
  if (hex) {
    const digits = strip0x(hex);
    if (!/^[0-9a-fA-F]{64}$/.test(digits)) {
      throw new Error("PRIVATE_KEY_HEX must be 32 bytes of hex");
    }
    fromHex = getBytes("0x" + digits);
  }
  if (cb58) {
    fromCb58 = decodeCb58(cb58.startsWith(CB58_PREFIX) ? cb58.slice(CB58_PREFIX.length) : cb58, "PRIVATE_KEY_CB58");
    if (fromCb58.length !== 32) {
      throw new Error("PRIVATE_KEY_CB58 must decode to 32 bytes");
    }
  }
  if (fromHex && fromCb58 && hexlify(fromHex) !== hexlify(fromCb58)) {
    throw new Error("PRIVATE_KEY_HEX and PRIVATE_KEY_CB58 are different keys");
  }
  const key = fromHex ?? fromCb58;
  if (!key) {
    throw new Error("No private key found: set PRIVATE_KEY_HEX or PRIVATE_KEY_CB58 in the env file");
  }
  return key;
}
