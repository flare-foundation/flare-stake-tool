/**
 * ForDefi custodial signing: post the message hash of an unsigned file to the
 * ForDefi API (`forDefi sign`), later fetch the signature and write the signed
 * file (`forDefi fetch`). The request shape and the `path|timestamp|body`
 * SHA256 authentication are a contract with ForDefi and must not change.
 */
import crypto from "crypto";
import fs from "fs";
import { messageOf, readUnsignedTxJson, writeSignedTxJson, writeUnsignedTxJson } from "../core/files";
import type { ContextFile } from "./env";

export const FORDEFI_HOST = "api.fordefi.com";
export const FORDEFI_TOKEN_FILE = "./token";
export const FORDEFI_PRIVATE_KEY_FILE = "./private.pem";

export type FetchLike = typeof fetch;

interface ForDefiTransactionResponse {
  id: string;
  signatures?: { data: string; signed_by?: unknown }[];
  [key: string]: unknown;
}

interface VaultResponse {
  id: string;
  public_key_compressed?: string;
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
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`ForDefi ${what} did not answer with JSON${body ? `: ${body}` : ""}`);
  }
}

export async function getVaultPublicKey(vaultId: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const response = await fetchImpl(`https://${FORDEFI_HOST}/api/v1/vaults/${vaultId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${readToken()}` },
  });
  const json = await forDefiJson<VaultResponse>(response, `vault lookup (${vaultId})`);
  if (!json.public_key_compressed) {
    throw new Error("public_key_compressed not found in vault response");
  }
  return Buffer.from(json.public_key_compressed, "base64").toString("hex");
}

/** Posts the unsigned transaction's hash for signing and records the ForDefi transaction id in the unsigned file. */
export async function sendToForDefi(id: string, context: ContextFile, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!context.vaultId) {
    throw new Error("vaultId not found in context");
  }
  const vaultPublicKey = await getVaultPublicKey(context.vaultId, fetchImpl);
  if (context.publicKey.replace(/^0x/, "").toLowerCase() !== vaultPublicKey.toLowerCase()) {
    throw new Error("public key does not match the vault");
  }
  const unsigned = readUnsignedTxJson(id);
  const hashBase64 = Buffer.from(messageOf(unsigned), "hex").toString("base64");
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
  if (!json.id) {
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
  const response = await fetchImpl(`https://${FORDEFI_HOST}/api/v1/transactions/${unsigned.forDefiTxId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${readToken()}` },
  });
  const json = await forDefiJson<ForDefiTransactionResponse>(response, `transaction lookup (${unsigned.forDefiTxId})`);
  const data = json.signatures?.[0]?.data;
  if (!data) {
    const state = typeof json["state"] === "string" ? ` (ForDefi state: ${json["state"]})` : "";
    throw new Error(`Transaction is not signed yet${state}; run forDefi fetch again once it is`);
  }
  const signature = Buffer.from(data, "base64").toString("hex");
  writeSignedTxJson({ ...unsigned, signature }, id);
  return signature;
}
