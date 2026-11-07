/**
 * ForDefi custodial signing: post the message hash of an unsigned file to the
 * ForDefi API (`forDefi sign`), later fetch the signature and write the signed
 * file (`forDefi fetch`). The request shape and the `path|timestamp|body`
 * SHA256 authentication are a contract with ForDefi and must not change.
 */
import crypto from "crypto";
import fs from "fs";
import { bundleFromConsistentTxJson, readUnsignedTxJson, saveSignedTxJson, writeUnsignedTxJson } from "../core/files";
import { normalizePublicKey } from "../chain/keys";
import { isJsonObject } from "../core/json";
import { SIGNATURE_LENGTH, equalBytes } from "../core/signing/signature";
import type { ContextFile } from "./env";

export const FORDEFI_HOST = "api.fordefi.com";
export const FORDEFI_TOKEN_FILE = "./token";
export const FORDEFI_PRIVATE_KEY_FILE = "./private.pem";

export type FetchLike = typeof fetch;

/** ForDefi's answers as they may come: only the fields used are checked, and extra fields are ignored. */
interface ForDefiTransactionResponse {
  id?: unknown;
  signatures?: unknown;
  [key: string]: unknown;
}

interface VaultResponse {
  id?: unknown;
  public_key_compressed?: unknown;
}

const readToken = (): string => fs.readFileSync(FORDEFI_TOKEN_FILE, "utf8").trim();

/**
 * The JSON body of a ForDefi answer. A refused request (expired token, unknown
 * vault, server error) is reported with its HTTP status and body instead of
 * surfacing later as a missing field.
 */
async function forDefiJson<T>(response: Response, what: string): Promise<T> {
  const text = await response.text();
  const body = text.trim().slice(0, 300);
  if (!response.ok) {
    throw new Error(
      `ForDefi ${what} failed: HTTP ${response.status} ${response.statusText}`.trim() + (body ? `: ${body}` : "")
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`ForDefi ${what} did not answer with JSON${body ? `: ${body}` : ""}`);
  }
  if (!isJsonObject(json)) {
    throw new Error(`ForDefi ${what} did not answer with a JSON object${body ? `: ${body}` : ""}`);
  }
  return json as T;
}

export async function getVaultPublicKey(vaultId: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const response = await fetchImpl(`https://${FORDEFI_HOST}/api/v1/vaults/${encodeURIComponent(vaultId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${readToken()}` },
  });
  const json = await forDefiJson<VaultResponse>(response, `vault lookup (${vaultId})`);
  if (typeof json.public_key_compressed !== "string" || !json.public_key_compressed) {
    throw new Error("public_key_compressed not found in vault response");
  }
  return Buffer.from(json.public_key_compressed, "base64").toString("hex");
}

/** The compressed form of a public key given as hex in any form `normalizePublicKey` takes; `whose` names it in errors. */
function publicKeyOf(hex: string, whose: string): Uint8Array {
  try {
    return normalizePublicKey(hex);
  } catch (error) {
    throw new Error(`${whose} is not a valid public key (${error instanceof Error ? error.message : String(error)})`, {
      cause: error,
    });
  }
}

/** Posts the unsigned transaction's hash for signing and records the ForDefi transaction id in the unsigned file. */
export async function sendToForDefi(id: string, context: ContextFile, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!context.vaultId) {
    throw new Error("vaultId not found in context");
  }
  const unsigned = readUnsignedTxJson(id);
  // the hash ForDefi signs: the file's message, which must be the digest of the file's transaction
  const { digest } = bundleFromConsistentTxJson(unsigned);
  const vaultPublicKey = await getVaultPublicKey(context.vaultId, fetchImpl);
  // compared as keys: a context may hold its key uncompressed or with 0x, the vault answers it compressed
  const contextKey = publicKeyOf(context.publicKey, "The context's publicKey");
  if (!equalBytes(contextKey, publicKeyOf(vaultPublicKey, `The public key of ForDefi vault ${context.vaultId}`))) {
    throw new Error("public key does not match the vault");
  }
  const hashBase64 = Buffer.from(digest).toString("base64");
  const requestBody = JSON.stringify({
    vault_id: context.vaultId,
    signer_type: "api_signer",
    type: "black_box_signature",
    details: { format: "hash_binary", hash_binary: hashBase64 },
  });
  const path = "/api/v1/transactions";
  const timestamp = Date.now();
  const payload = `${path}|${timestamp}|${requestBody}`;
  const privateKey = crypto.createPrivateKey(fs.readFileSync(FORDEFI_PRIVATE_KEY_FILE, "utf8"));
  const signature = crypto.createSign("SHA256").update(payload, "utf8").end().sign(privateKey, "base64");

  const response = await fetchImpl(`https://${FORDEFI_HOST}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readToken()}`,
      "X-Timestamp": timestamp.toString(),
      "X-Signature": signature,
    },
    body: requestBody,
  });
  const json = await forDefiJson<ForDefiTransactionResponse>(response, "signature request");
  if (typeof json.id !== "string" || !json.id) {
    throw new Error(`ForDefi did not return a transaction id: ${JSON.stringify(json).slice(0, 200)}`);
  }
  writeUnsignedTxJson({ ...unsigned, forDefiTxId: json.id }, id);
  return json.id;
}

/** Fetches the signature of a previously posted transaction and writes the signed file. */
export async function fetchForDefiSignature(id: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const unsigned = readUnsignedTxJson(id);
  if (!unsigned.forDefiTxId) {
    throw new Error(`Transaction ${id} was not sent to ForDefi (no forDefiTxId in the unsigned file)`);
  }
  const url = `https://${FORDEFI_HOST}/api/v1/transactions/${encodeURIComponent(unsigned.forDefiTxId)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${readToken()}` },
  });
  const json = await forDefiJson<ForDefiTransactionResponse>(response, `transaction lookup (${unsigned.forDefiTxId})`);
  const first: unknown = Array.isArray(json.signatures) ? json.signatures[0] : undefined;
  const data = isJsonObject(first) ? first["data"] : undefined;
  if (data === undefined || data === null || data === "") {
    const state = typeof json["state"] === "string" ? ` (ForDefi state: ${json["state"]})` : "";
    throw new Error(`Transaction is not signed yet${state}; run forDefi fetch again once it is`);
  }
  const bytes = typeof data === "string" ? Buffer.from(data, "base64") : undefined;
  if (bytes?.length !== SIGNATURE_LENGTH) {
    throw new Error(
      `ForDefi answered a signature that is not ${SIGNATURE_LENGTH} bytes of base64: ${JSON.stringify(data).slice(0, 200)}`
    );
  }
  const signature = bytes.toString("hex");
  saveSignedTxJson({ ...unsigned, signature }, id);
  return signature;
}
