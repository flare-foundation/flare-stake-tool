/**
 * ForDefi custodial signing: post the message hash of an unsigned file to the
 * ForDefi API (`forDefi sign`), later fetch the signature and write the signed
 * file (`forDefi fetch`). The request shape and the `path|timestamp|body`
 * SHA256 authentication are a contract with ForDefi and must not change.
 */
import crypto from "crypto";
import fs from "fs";
import {
  bundleFromConsistentTxJson,
  checkFileNetwork,
  forDefiHashOf,
  readUnsignedTxJson,
  saveSignedTxJson,
  signerMismatch,
  writeUnsignedTxJson,
} from "../core/files";
import { normalizePublicKey } from "../chain/keys";
import { networkConfig, redactSecrets, rememberSecret, type NetworkConfig } from "../chain/network";
import { isJsonObject } from "../core/json";
import { recoverSigner } from "../core/signing/attach";
import { SIGNATURE_LENGTH, equalBytes, toHex } from "../core/signing/signature";
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

/** The API token, remembered for masking as soon as it is read: a ForDefi answer may repeat it in an error body. */
function readToken(): string {
  const token = fs.readFileSync(FORDEFI_TOKEN_FILE, "utf8").trim();
  rememberSecret(token);
  return token;
}

/**
 * The start of a ForDefi answer for an error message, masked before it is cut: a secret the answer repeats (the
 * token) would no longer match once cut, and all of it but the last characters would print.
 */
const excerpt = (text: string, length: number): string => redactSecrets(text.trim()).slice(0, length);

/**
 * The JSON body of a ForDefi answer. A refused request (expired token, unknown
 * vault, server error) is reported with its HTTP status and body instead of
 * surfacing later as a missing field.
 */
async function forDefiJson<T>(response: Response, what: string): Promise<T> {
  const text = await response.text();
  const body = excerpt(text, 300);
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

/**
 * Posts the unsigned transaction's hash for signing and records the ForDefi transaction id in the unsigned file; returns
 * that id and the hash posted, to compare with the one printed at build time. The file must be for `network` (the
 * selected one, by default the context's): a signature is valid on the file's network only.
 */
export async function sendToForDefi(
  id: string,
  context: ContextFile,
  fetchImpl: FetchLike = fetch,
  network: Pick<NetworkConfig, "name" | "networkId" | "chainId"> = networkConfig(context.network, {})
): Promise<{ forDefiTxId: string; forDefiHash: string }> {
  if (!context.vaultId) {
    throw new Error("vaultId not found in context");
  }
  const unsigned = readUnsignedTxJson(id);
  // the hash ForDefi signs: the file's message, which must be the digest of the file's transaction
  const bundle = bundleFromConsistentTxJson(unsigned);
  checkFileNetwork(id, bundle, network);
  const { digest } = bundle;
  const vaultPublicKey = await getVaultPublicKey(context.vaultId, fetchImpl);
  // compared as keys: a context may hold its key uncompressed or with 0x, the vault answers it compressed
  const contextKey = publicKeyOf(context.publicKey, "The context's publicKey");
  if (!equalBytes(contextKey, publicKeyOf(vaultPublicKey, `The public key of ForDefi vault ${context.vaultId}`))) {
    throw new Error("public key does not match the vault");
  }
  const mismatch = signerMismatch(unsigned, contextKey);
  if (mismatch) {
    throw new Error(
      `Transaction ${id} was built for ${mismatch.recorded}, but ForDefi vault ${context.vaultId} holds ` +
        `${mismatch.actual}; sign it with the context and vault of the account it was built for`
    );
  }
  const hashBase64 = forDefiHashOf(toHex(digest));
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
    throw new Error(`ForDefi did not return a transaction id: ${excerpt(JSON.stringify(json), 200)}`);
  }
  // the id goes into the unsigned file, which is shared with co-signers
  if (redactSecrets(json.id) !== json.id) {
    throw new Error("ForDefi answered a transaction id that holds a secret (such as the API token); it is not saved");
  }
  writeUnsignedTxJson({ ...unsigned, forDefiTxId: json.id }, id);
  return { forDefiTxId: json.id, forDefiHash: hashBase64 };
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
      `ForDefi answered a signature that is not ${SIGNATURE_LENGTH} bytes of base64: ${excerpt(JSON.stringify(data), 200)}`
    );
  }
  // the signature must be over this file's transaction, by the account it was built for: a mixed-up or wrong answer
  // would replace a good signature not sent yet, and send would refuse the file only later
  let signer: Uint8Array;
  try {
    signer = recoverSigner(bundleFromConsistentTxJson(unsigned), bytes);
  } catch (error) {
    throw new Error(
      `ForDefi answered a signature of no key for transaction ${id} (${error instanceof Error ? error.message : String(error)}); ` +
        "the signed file is not written",
      { cause: error }
    );
  }
  const mismatch = signerMismatch(unsigned, signer);
  if (mismatch) {
    throw new Error(
      `Transaction ${id} was built for ${mismatch.recorded}, but ForDefi answered a signature of ${mismatch.actual} ` +
        "(over another transaction, or by another key); the signed file is not written"
    );
  }
  const signature = bytes.toString("hex");
  saveSignedTxJson({ ...unsigned, signature }, id);
  return signature;
}
