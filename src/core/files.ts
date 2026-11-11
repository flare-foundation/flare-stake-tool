/**
 * The unsigned/signed transaction files of the external-signature (ForDefi)
 * flow. The formats are a contract with external signers and are frozen:
 *
 *   ForDefiTxnFiles/UnsignedTxns/<id>.unsignedTx.json
 *     atomic: { transactionType, signatureRequests: [{ message, signer }], unsignedTransactionBuffer, serialization, forDefiHash }
 *     EVM:    { transactionType: "EVM", rawTx, message, signer, forDefiHash }
 *   `signer` is the account the file was built for (the P-chain address, the C-chain address for EVM); files from
 *   versions before 5.0.0 have it empty or missing.
 *   ForDefiTxnFiles/SignedTxns/<id>.signedTx.json
 *     the unsigned content plus `signature` (r|s|v hex) and, once submitted, `isSentToChain: true`
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { UnsignedTx, messageHashFromUnsignedTx, secp256k1, utils as futils, type Int } from "@flarenetwork/flarejs";
import { Transaction, computeAddress, getAddress, getBytes, hexlify, type TransactionLike } from "ethers";
import type { Account } from "../chain/keys";
import type { NetworkConfig } from "../chain/network";
import { chainOfAtomicTx, isAtomicTxType, type UnsignedTxBundle } from "./types";
import { toHex } from "./signing/signature";
import { isJsonObject, parseJson } from "./json";

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
  signer?: string | undefined;
  forDefiHash?: string | undefined;
  forDefiTxId?: string | undefined;
}

export type UnsignedTxJson = UnsignedAtomicTxJson | UnsignedEvmTxJson;
export type SignedTxJson = UnsignedTxJson & { signature: string; isSentToChain?: boolean | undefined };

export const isEvmTxJson = (json: UnsignedTxJson): json is UnsignedEvmTxJson => json.transactionType === "EVM";

/** A transaction id: a file name in ForDefiTxnFiles, never a path out of it ("../x") or a hidden file. */
const TX_ID = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** The id, refused unless it names a file inside its ForDefiTxnFiles directory. */
export function checkedTxId(id: string): string {
  if (!TX_ID.test(id)) {
    throw new Error(`Invalid transaction id "${id}": use letters, digits, ".", "_" and "-", not starting with "."`);
  }
  return id;
}

export function unsignedTxPath(id: string, cwd = process.cwd()): string {
  return path.join(cwd, TX_FILES_DIR, UNSIGNED_TX_DIR, `${checkedTxId(id)}.unsignedTx.json`);
}

export function signedTxPath(id: string, cwd = process.cwd()): string {
  return path.join(cwd, TX_FILES_DIR, SIGNED_TX_DIR, `${checkedTxId(id)}.signedTx.json`);
}

/** The permission bits of `file`, or undefined when there is no such file. */
function modeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mode & 0o7777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Replaces `file` with `content` through a temporary file in the same directory and a rename, so that an interrupted
 * write leaves the old file or the new one, never half of one. Not a lock: two writers can still replace each other.
 */
export function replaceFile(file: string, content: string): void {
  // a short name of its own: the target's name plus a suffix can pass the 255-byte limit of a file name
  const temp = path.join(path.dirname(file), `.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const mode = modeOf(file);
  // a file someone restricted stays restricted: the temporary file starts readable by its owner only and takes the
  // replaced file's mode before the rename; a new file gets the usual default
  fs.writeFileSync(temp, content, { flag: "wx", mode: mode === undefined ? 0o666 : 0o600 });
  try {
    if (mode !== undefined) fs.chmodSync(temp, mode);
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
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

/** The file of a bundle built for `account`, which it records as `signer`; not part of the hash. */
export function unsignedTxJsonFromBundle(bundle: UnsignedTxBundle, account: Account): UnsignedTxJson {
  if (bundle.kind === "evm") {
    return {
      transactionType: "EVM",
      rawTx: bundle.rawTx,
      message: toHex(bundle.digest),
      signer: account.cAddress,
    };
  }
  return {
    transactionType: bundle.txType,
    signatureRequests: [{ message: toHex(bundle.digest), signer: account.pAddress }],
    unsignedTransactionBuffer: toHex(bundle.unsignedTx.toBytes()),
    serialization: JSON.stringify(bundle.unsignedTx.toJSON()),
  };
}

/** The account a file records as `signer`, or undefined for files from before 5.0.0, where it is empty or missing. */
function recordedSigner(json: UnsignedTxJson): string | undefined {
  const signer = isEvmTxJson(json) ? json.signer : json.signatureRequests[0]?.signer;
  return signer === undefined || signer === "" ? undefined : signer;
}

/**
 * The account the file was built for and the one holding `publicKey`, when they differ; undefined when they are the
 * same or the file records none. Atomic files compare the address bytes: `--network` can change the prefix for the
 * same key, and the file's network is checked where it is sent. The field guards against a mixed-up context or
 * vault, not against an edited file: it is not covered by the signed hash.
 */
export function signerMismatch(
  json: UnsignedTxJson,
  publicKey: Uint8Array
): { recorded: string; actual: string } | undefined {
  const recorded = recordedSigner(json);
  if (recorded === undefined) return undefined;
  if (isEvmTxJson(json)) {
    let address: string;
    try {
      address = getAddress(recorded);
    } catch {
      throw new Error(`The file's signer "${recorded}" is not a C-chain address`);
    }
    const actual = computeAddress(hexlify(publicKey));
    return address === actual ? undefined : { recorded, actual };
  }
  let parsed: [string, string, Uint8Array];
  try {
    parsed = futils.parse(recorded);
  } catch {
    throw new Error(`The file's signer "${recorded}" is not a P-chain address`);
  }
  const [, hrp, bytes] = parsed;
  const actualBytes = secp256k1.publicKeyBytesToAddress(publicKey);
  if (bytes.length === actualBytes.length && bytes.every((byte, i) => byte === actualBytes[i])) return undefined;
  return { recorded, actual: `P-${futils.formatBech32(hrp, actualBytes)}` };
}

/** Rebuilds the bundle from a file so that it can be signed/attached/submitted like a fresh one. */
export function bundleFromUnsignedTxJson(json: UnsignedTxJson): UnsignedTxBundle {
  if (isEvmTxJson(json)) {
    // Files written before v4.4.0 carry no type; ethers then resolves EIP-2930, which is what they were signed as.
    const tx = Transaction.from(json.rawTx);
    // the file does not say which EVM operation built it; signing and sending treat them all alike
    return { kind: "evm", txType: "customCChainTx", tx, rawTx: json.rawTx, digest: getBytes(tx.unsignedHash) };
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

/**
 * Refuses a file built for another network than the selected one, before it is signed or sent: the node would refuse
 * it with a less clear error, and a signature for it is one for the other network. Atomic transactions carry the
 * network id, EVM ones the chain id, which differ on Songbird and Coston. An EVM transaction without one (chain id 0:
 * an unprotected legacy one, or a typed one naming 0) is refused as well: a signature for it is valid on every EVM
 * chain, and no version of this tool wrote one.
 */
export function checkFileNetwork(
  id: string,
  bundle: UnsignedTxBundle,
  network: Pick<NetworkConfig, "name" | "networkId" | "chainId">
): void {
  if (bundle.kind === "atomic") {
    const tx = bundle.unsignedTx.getTx() as { baseTx?: { NetworkId: Int }; networkId?: Int };
    const networkId = (tx.baseTx?.NetworkId ?? tx.networkId)?.value();
    if (networkId !== network.networkId) {
      throw new Error(
        `Transaction ${id} is for network id ${String(networkId)}, not ${network.name} (${network.networkId}); ` +
          "select its network with --network"
      );
    }
    return;
  }
  const { chainId } = bundle.tx;
  if (chainId !== BigInt(network.chainId)) {
    throw new Error(
      `Transaction ${id} is for chain id ${chainId}, not ${network.name} (${network.chainId}); ` +
        "select its network with --network"
    );
  }
}

/**
 * The bundle of a file whose representations of the transaction agree: the message an external signer signs must be
 * the digest of the transaction in `serialization` (EVM: `rawTx`), and an atomic file's `unsignedTransactionBuffer`,
 * when present, must be that transaction's bytes, and its `forDefiHash`, when present, that digest in base64 (the
 * value printed at build time for co-signers to compare). Otherwise a file could show one transaction and have another
 * one's hash signed. A file rewritten consistently still passes; co-signers rebuilding it and comparing the hash catch
 * that.
 */
export function bundleFromConsistentTxJson(json: UnsignedTxJson): UnsignedTxBundle {
  const bundle = bundleFromUnsignedTxJson(json);
  const digest = toHex(bundle.digest);
  const message = messageOf(json).replace(/^0x/i, "").toLowerCase();
  if (message !== digest) {
    throw new Error(
      `The file's message ${messageOf(json)} is not the hash of its transaction (${digest}); rebuild the file`
    );
  }
  if (json.forDefiHash && json.forDefiHash !== forDefiHashOf(digest)) {
    throw new Error(
      `The file's forDefiHash ${json.forDefiHash} is not the hash of its transaction (${forDefiHashOf(digest)}); ` +
        "rebuild the file"
    );
  }
  if (bundle.kind === "atomic" && !isEvmTxJson(json) && json.unsignedTransactionBuffer) {
    const buffer = json.unsignedTransactionBuffer.replace(/^0x/i, "").toLowerCase();
    if (buffer !== toHex(bundle.unsignedTx.toBytes())) {
      throw new Error(
        "The file's unsignedTransactionBuffer is not the transaction in its serialization; rebuild the file"
      );
    }
  }
  return bundle;
}

/**
 * Writes the unsigned file and returns the ForDefi hash. Refuses an id that already has an unsigned or a signed file:
 * `send` reads only the signed one, so an old signed file left under a reused id would be sent instead of the new
 * transaction.
 */
export function saveUnsignedTxJson(
  json: UnsignedTxJson,
  id: string,
  cwd = process.cwd()
): { file: string; forDefiHash: string } {
  const file = unsignedTxPath(id, cwd);
  if (fs.existsSync(file)) {
    throw new Error(`unsignedTx file ${file} already exists`);
  }
  const signed = signedTxPath(id, cwd);
  if (fs.existsSync(signed)) {
    throw new Error(`signedTx file ${signed} already exists: transaction ${id} was already signed; use another id`);
  }
  const forDefiHash = forDefiHashOf(messageOf(json));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // "wx" fails if the file appeared since the check
  fs.writeFileSync(file, JSON.stringify({ ...json, forDefiHash }, null, 2), { flag: "wx" });
  return { file, forDefiHash };
}

/** What is wrong with a transaction file's fields the tool reads, if anything; other fields are not looked at. */
function txJsonProblem(json: Record<string, unknown>): string | undefined {
  if (typeof json["transactionType"] !== "string") return "transactionType is missing";
  if (json["forDefiTxId"] !== undefined && (typeof json["forDefiTxId"] !== "string" || json["forDefiTxId"] === "")) {
    return "forDefiTxId is not a non-empty string";
  }
  if (json["transactionType"] === "EVM") {
    if (!isJsonObject(json["rawTx"])) return "rawTx is missing";
    if (typeof json["message"] !== "string") return "message is missing";
    if (json["signer"] !== undefined && typeof json["signer"] !== "string") return "signer is not a string";
    return undefined;
  }
  const requests = json["signatureRequests"];
  if (!Array.isArray(requests) || !isJsonObject(requests[0]) || typeof requests[0]["message"] !== "string") {
    return "signatureRequests[0].message is missing";
  }
  if (requests[0]["signer"] !== undefined && typeof requests[0]["signer"] !== "string") {
    return "signatureRequests[0].signer is not a string";
  }
  if (typeof json["serialization"] !== "string") return "serialization is missing";
  const buffer = json["unsignedTransactionBuffer"];
  if (buffer !== undefined && typeof buffer !== "string") return "unsignedTransactionBuffer is not a string";
  return undefined;
}

/**
 * A transaction file, read and checked: only the fields the tool reads, and the object is returned as it was, so that
 * unknown fields (older versions' metadata) stay in the file when it is rewritten.
 */
function readTxFile(file: string, kind: string): Record<string, unknown> {
  const json = parseJson(fs.readFileSync(file, "utf8"), `${kind} file ${file}`);
  if (!isJsonObject(json)) {
    throw new Error(`${kind} file ${file} is not a transaction file: not a JSON object`);
  }
  const problem = txJsonProblem(json);
  if (problem) {
    throw new Error(`${kind} file ${file} is not a transaction file: ${problem}`);
  }
  return json;
}

export function readUnsignedTxJson(id: string, cwd = process.cwd()): UnsignedTxJson {
  const file = unsignedTxPath(id, cwd);
  if (!fs.existsSync(file)) {
    throw new Error(`unsignedTx file ${file} does not exist`);
  }
  return readTxFile(file, "unsignedTx") as unknown as UnsignedTxJson;
}

/** Replaces the unsigned file of an id, as `forDefi sign` does to record the ForDefi transaction id. */
export function writeUnsignedTxJson(json: UnsignedTxJson, id: string, cwd = process.cwd()): void {
  replaceFile(unsignedTxPath(id, cwd), JSON.stringify(json));
}

export function readSignedTxJson(id: string, cwd = process.cwd()): SignedTxJson {
  const file = signedTxPath(id, cwd);
  if (!fs.existsSync(file)) {
    throw new Error(`signedTx file ${file} does not exist`);
  }
  const json = readTxFile(file, "signedTx");
  if (typeof json["signature"] !== "string" || json["signature"] === "") {
    throw new Error(`signedTx file ${file} does not contain signature`);
  }
  if (json["isSentToChain"] !== undefined && typeof json["isSentToChain"] !== "boolean") {
    throw new Error(`signedTx file ${file} is not a transaction file: isSentToChain is not true or false`);
  }
  return json as unknown as SignedTxJson;
}

/** Writes the signed file of an id, replacing one that is there (marking it sent, say). */
export function writeSignedTxJson(json: SignedTxJson, id: string, cwd = process.cwd()): void {
  const file = signedTxPath(id, cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  replaceFile(file, JSON.stringify(json));
}

/**
 * Saves the signed file `forDefi fetch` got: created with "wx", so that a file appearing since the check is not
 * overwritten; left as it is when it already holds exactly this; replaced when it holds another signature, unless it
 * was sent, which would lose the mark that stops a second submission.
 */
export function saveSignedTxJson(json: SignedTxJson, id: string, cwd = process.cwd()): void {
  const file = signedTxPath(id, cwd);
  const content = JSON.stringify(json);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, { flag: "wx" });
    return;
  }
  const existing = fs.readFileSync(file, "utf8");
  if (existing === content) return;
  if (isMarkedSent(existing, file)) {
    throw new Error("Tx already sent to chain");
  }
  replaceFile(file, content);
}

/** Whether a signed file's text carries the sent mark; any true-ish value counts, so that no mark is ever missed. */
function isMarkedSent(text: string, file: string): boolean {
  const json = parseJson(text, `signedTx file ${file}`);
  return isJsonObject(json) && !!json["isSentToChain"];
}

export function isAlreadySentToChain(id: string, cwd = process.cwd()): boolean {
  const file = signedTxPath(id, cwd);
  if (!fs.existsSync(file)) return false;
  return isMarkedSent(fs.readFileSync(file, "utf8"), file);
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
