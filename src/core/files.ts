/**
 * The unsigned/signed transaction files of the external-signature (ForDefi)
 * flow. The formats are a contract with external signers and are frozen:
 *
 *   ForDefiTxnFiles/UnsignedTxns/<id>.unsignedTx.json
 *     atomic: { transactionType, signatureRequests: [{ message, signer }], unsignedTransactionBuffer, serialization, forDefiHash }
 *     EVM:    { transactionType: "EVM", rawTx, message, forDefiHash }
 *   ForDefiTxnFiles/SignedTxns/<id>.signedTx.json
 *     the unsigned content plus `signature` (r|s|v hex) and, once submitted, `isSentToChain: true`
 */
import fs from "fs";
import path from "path";
import { UnsignedTx, messageHashFromUnsignedTx } from "@flarenetwork/flarejs";
import { Transaction, getBytes, type TransactionLike } from "ethers";
import { chainOfAtomicTx, isAtomicTxType, type EvmTxType, type UnsignedTxBundle } from "./types";
import { toHex } from "./signing/signature";

export const TX_FILES_DIR = "ForDefiTxnFiles";
export const UNSIGNED_TX_DIR = "UnsignedTxns";
export const SIGNED_TX_DIR = "SignedTxns";

export interface UnsignedAtomicTxJson {
  transactionType: string;
  signatureRequests: { message: string; signer: string }[];
  unsignedTransactionBuffer: string;
  serialization: string;
  forDefiHash?: string | undefined;
  forDefiTxId?: string | undefined;
}

export interface UnsignedEvmTxJson {
  transactionType: "EVM";
  rawTx: TransactionLike;
  message: string;
  forDefiHash?: string | undefined;
  forDefiTxId?: string | undefined;
}

export type UnsignedTxJson = UnsignedAtomicTxJson | UnsignedEvmTxJson;
export type SignedTxJson = UnsignedTxJson & { signature: string; isSentToChain?: boolean | undefined };

export const isEvmTxJson = (json: UnsignedTxJson): json is UnsignedEvmTxJson => json.transactionType === "EVM";

export function unsignedTxPath(id: string, cwd = process.cwd()): string {
  return path.join(cwd, TX_FILES_DIR, UNSIGNED_TX_DIR, `${id}.unsignedTx.json`);
}

export function signedTxPath(id: string, cwd = process.cwd()): string {
  return path.join(cwd, TX_FILES_DIR, SIGNED_TX_DIR, `${id}.signedTx.json`);
}

/** ForDefi wants the hash to sign as base64. */
export const forDefiHashOf = (messageHex: string): string => Buffer.from(messageHex, "hex").toString("base64");

/** The message hash an external signer has to sign, hex without 0x. */
export function messageOf(json: UnsignedTxJson): string {
  if (isEvmTxJson(json)) return json.message;
  const message = json.signatureRequests[0]?.message;
  if (!message) throw new Error("Unsigned transaction file has no signature request");
  return message;
}

export function unsignedTxJsonFromBundle(bundle: UnsignedTxBundle): UnsignedTxJson {
  if (bundle.kind === "evm") {
    return {
      transactionType: "EVM",
      rawTx: bundle.rawTx,
      message: toHex(bundle.digest),
    };
  }
  return {
    transactionType: bundle.txType,
    signatureRequests: [{ message: toHex(bundle.digest), signer: "" }],
    unsignedTransactionBuffer: toHex(bundle.unsignedTx.toBytes()),
    serialization: JSON.stringify(bundle.unsignedTx.toJSON()),
  };
}

/** Rebuilds the bundle from a file so that it can be signed/attached/submitted like a fresh one. */
export function bundleFromUnsignedTxJson(
  json: UnsignedTxJson,
  evmTxType: EvmTxType = "customCChainTx"
): UnsignedTxBundle {
  if (isEvmTxJson(json)) {
    // Files written before v4.4.0 carry no type; ethers then resolves EIP-2930, which is what they were signed as.
    const tx = Transaction.from(json.rawTx);
    return { kind: "evm", txType: evmTxType, tx, rawTx: json.rawTx, digest: getBytes(tx.unsignedHash) };
  }
  if (!isAtomicTxType(json.transactionType)) {
    throw new Error(`Unknown transaction type: ${json.transactionType}`);
  }
  const unsignedTx = UnsignedTx.fromJSON(json.serialization);
  return {
    kind: "atomic",
    chain: chainOfAtomicTx(json.transactionType),
    txType: json.transactionType,
    unsignedTx,
    digest: messageHashFromUnsignedTx(unsignedTx),
  };
}

/** Writes the unsigned file (refusing to overwrite) and returns the ForDefi hash. */
export function saveUnsignedTxJson(
  json: UnsignedTxJson,
  id: string,
  cwd = process.cwd()
): { file: string; forDefiHash: string } {
  const file = unsignedTxPath(id, cwd);
  if (fs.existsSync(file)) {
    throw new Error(`unsignedTx file ${file} already exists`);
  }
  const forDefiHash = forDefiHashOf(messageOf(json));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...json, forDefiHash }, null, 2));
  return { file, forDefiHash };
}

export function readUnsignedTxJson(id: string, cwd = process.cwd()): UnsignedTxJson {
  const file = unsignedTxPath(id, cwd);
  if (!fs.existsSync(file)) {
    throw new Error(`unsignedTx file ${file} does not exist`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as UnsignedTxJson;
}

export function writeUnsignedTxJson(json: UnsignedTxJson, id: string, cwd = process.cwd()): void {
  fs.writeFileSync(unsignedTxPath(id, cwd), JSON.stringify(json));
}

export function readSignedTxJson(id: string, cwd = process.cwd()): SignedTxJson {
  const file = signedTxPath(id, cwd);
  if (!fs.existsSync(file)) {
    throw new Error(`signedTx file ${file} does not exist`);
  }
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as SignedTxJson;
  if (!json.signature) {
    throw new Error(`signedTx file ${file} does not contain signature`);
  }
  return json;
}

export function writeSignedTxJson(json: SignedTxJson, id: string, cwd = process.cwd()): void {
  const file = signedTxPath(id, cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
}

export function isAlreadySentToChain(id: string, cwd = process.cwd()): boolean {
  const file = signedTxPath(id, cwd);
  if (!fs.existsSync(file)) return false;
  return !!(JSON.parse(fs.readFileSync(file, "utf8")) as SignedTxJson).isSentToChain;
}

export function markSentToChain(id: string, cwd = process.cwd()): void {
  const json = readSignedTxJson(id, cwd);
  json.isSentToChain = true;
  writeSignedTxJson(json, id, cwd);
}

/** Undoes markSentToChain for a transaction the chain refused, so that it can be sent again. */
export function clearSentToChain(id: string, cwd = process.cwd()): void {
  const json = readSignedTxJson(id, cwd);
  delete json.isSentToChain;
  writeSignedTxJson(json, id, cwd);
}
