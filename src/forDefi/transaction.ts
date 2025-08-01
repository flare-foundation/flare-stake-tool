import { readFileSync, writeFileSync, mkdirSync } from "fs";
import crypto from "crypto";
import { unPrefix0x, readUnsignedTxJson } from "../utils";
import { readUnsignedEvmTx } from "./utils";
import {
  SignedTxJson,
  SignedEvmTxJson,
  UnsignedTxJson,
  UnsignedEvmTxJson,
  ContextFile,
} from "../interfaces";
import {
  gatewayHost,
  forDefiDirectory,
  forDefiSignedTxnDirectory,
  forDefiUnsignedTxnDirectory,
} from "../constants/forDefi";

interface ForDefiResponse {
  id: string;
  signatures: {
    data: string;
    signed_by: any;
  }[];
  [key: string]: unknown;
}

interface VaultResponse {
  id: string;
  public_key_compressed?: string;
}

/**
 * @description - Send signature to forDefi
 * @param unsignedTxidFile - path to the file
 * @param ctxFile - ctx file
 * @param evmTx - true if it is a regular EVM transaction
 * @returns
 */
export async function sendToForDefi(
  unsignedTxidFile: string,
  ctxFile: string,
  evmTx: boolean = false,
): Promise<string> {
  const accessToken = readFileSync("./token", "utf8");
  const file = readFileSync(ctxFile, "utf8");
  const ctx = JSON.parse(file) as ContextFile;

  // check if ctx file is valid
  if (!ctx.vaultId) {
    throw Error("vaultId not found in context");
  }
  const vault_id = ctx.vaultId;

  // vaultPublicKey should match public key in context file
  let vaultPublicKey = await getVaultPublickey(vault_id);
  if (unPrefix0x(ctx.publicKey) != vaultPublicKey) {
    throw Error("public key does not match the vault");
  }

  let hash: string;
  let txidObj: UnsignedTxJson | UnsignedEvmTxJson;
  if (!evmTx) {
    txidObj = readUnsignedTxJson(unsignedTxidFile);
    hash = txidObj.signatureRequests[0].message;
  } else {
    txidObj = readUnsignedEvmTx(unsignedTxidFile);
    hash = txidObj.message;
  }

  let hashBase64 = Buffer.from(hash, "hex").toString("base64");

  const requestJson = {
    vault_id: vault_id,
    signer_type: "api_signer",
    type: "black_box_signature",
    details: {
      format: "hash_binary",
      hash_binary: hashBase64,
    },
  };

  const requestBody = JSON.stringify(requestJson);
  const path = "/api/v1/transactions";
  const timestamp = new Date().getTime();
  const payload = `${path}|${timestamp}|${requestBody}`;

  const privateKeyFile = "./private.pem";
  const secretPem = readFileSync(privateKeyFile, "utf8");
  const privateKey = crypto.createPrivateKey(secretPem);
  const sign = crypto.createSign("SHA256").update(payload, "utf8").end();
  const signature1 = sign.sign(privateKey, "base64");

  const response = await fetch(`https://${gatewayHost}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Timestamp": timestamp.toString(),
      "X-Signature": signature1,
    },
    body: requestBody,
  });
  const responseJson = await response.json() as ForDefiResponse;
  let txId = responseJson.id;

  // write tx id (to later fetch the signature)
  txidObj.forDefiTxId = txId;
  writeFileSync(
    `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${unsignedTxidFile}.unsignedTx.json`,
    JSON.stringify(txidObj),
    "utf8",
  );
  return txId;
}

/**
 * @description - gets the signature from forDefi
 * @param unsignedTxidFile - unsigned transaction file
 * @param evmTx - true if it is a regular EVM transaction
 * @returns signature
 */
export async function getSignature(
  unsignedTxidFile: string,
  evmTx: boolean = false,
): Promise<string> {
  const path = "/api/v1/transactions";
  const accessToken = readFileSync("./token", "utf8");

  let txidObj: UnsignedTxJson | UnsignedEvmTxJson;
  let signedTxObj: SignedTxJson | SignedEvmTxJson;
  if (!evmTx) {
    txidObj = readUnsignedTxJson(unsignedTxidFile);
    signedTxObj = txidObj as SignedTxJson;
  } else {
    txidObj = readUnsignedEvmTx(unsignedTxidFile);
    signedTxObj = txidObj as SignedEvmTxJson;
  }
  let id = txidObj.forDefiTxId;

  let responseSignature;

  responseSignature = await fetch(`https://${gatewayHost}${path}/${id}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseJson = await responseSignature.json() as ForDefiResponse;

  let signatureHex;
  try {
    signatureHex = Buffer.from(
      responseJson.signatures[0].data,
      "base64",
    ).toString("hex");
  } catch (e: any) {
    throw Error("Transaction is not signed yet? " + e);
  }

  signedTxObj.signature = signatureHex;

  mkdirSync(`${forDefiDirectory}/${forDefiSignedTxnDirectory}`, {
    recursive: true,
  });
  writeFileSync(
    `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${unsignedTxidFile}.signedTx.json`,
    JSON.stringify(signedTxObj),
    "utf8",
  );

  return signatureHex;
}

/**
 * @description Gets the vault public key
 * @param vaultId - the vault id
 * @returns returns vault public key
 */
export async function getVaultPublickey(vaultId: string): Promise<string> {
  const path = "/api/v1/vaults";
  const accessToken = readFileSync("./token", "utf8");

  let response = await fetch(`https://${gatewayHost}${path}/${vaultId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const responseJson = await response.json() as VaultResponse;

  let pubKey = responseJson.public_key_compressed;
  // vault invalid or wrong environment (token) is used
  if (!pubKey) {
    throw new Error('public_key_compressed not found in vault response');
  }
  let pubKeyHex = Buffer.from(pubKey, "base64").toString("hex");

  return pubKeyHex;
}

async function createVault(vaultName: string, tokenPath: string): Promise<string> {
  const accessToken = readFileSync(tokenPath, "utf8");

  const requestJson = {
    type: "black_box",
    key_type: "ecdsa_secp256k1",
    name: vaultName,
  };

  const requestBody = JSON.stringify(requestJson);
  const path = "/api/v1/vaults";

  let response = await fetch(`https://${gatewayHost}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: requestBody,
  });
  const responseJson = await response.json() as VaultResponse;
  console.log(responseJson);
  let pubKey = responseJson.public_key_compressed;
  if (!pubKey) {
    throw new Error('public_key_compressed not found in vault response');
  }
  let pubKeyHex = Buffer.from(pubKey, "base64").toString("hex");
  console.log(pubKeyHex);

  return responseJson["id"];
}
