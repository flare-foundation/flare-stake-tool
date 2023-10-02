import fetch from 'node-fetch'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import crypto from "crypto"
import { unPrefix0x, readUnsignedTxJson } from "../utils"
import { readUnsignedWithdrawalTx } from './utils'
import { SignedTxJson, SignedWithdrawalTxJson, UnsignedTxJson, UnsignedWithdrawalTxJson, ContextFile } from '../interfaces'
import { gatewayHost, forDefiDirectory, forDefiSignedTxnDirectory, forDefiUnsignedTxnDirectory } from '../constants/forDefi'


/**
 * @description - Send signature to forDefi
 * @param unsignedTxidFile - path to the file
 * @param ctxFile - ctx file
 * @param withdrawal - boolen if its a withdrawl trx or not
 * @param _getVaultPublickey - for testcase mocking purpose, bydefault it calls getVaultPublickey
 * @returns
 */
export async function sendToForDefi(unsignedTxidFile: string, ctxFile: string, withdrawal: boolean = false, _getVaultPublickey = getVaultPublickey): Promise<string> {

    const accessToken = readFileSync("./token", 'utf8');
    const file = readFileSync(ctxFile, 'utf8');
    const ctx = JSON.parse(file) as ContextFile;

    const vault_id = ctx.vaultId!;

    // vaultPublicKey should match public key in contex file
    let vaultPublicKey = await _getVaultPublickey(vault_id);
    if (unPrefix0x(ctx.publicKey) != vaultPublicKey) {
        throw Error('public key does not match the vault')
    }

    let hash: string;
    let txidObj: UnsignedTxJson | UnsignedWithdrawalTxJson;
    if (!withdrawal) {
        txidObj = readUnsignedTxJson(unsignedTxidFile);
        hash = txidObj.signatureRequests[0].message;
    } else {
        txidObj = readUnsignedWithdrawalTx(unsignedTxidFile);
        hash = txidObj.message;
    }

    let hashBase64 = Buffer.from(hash, 'hex').toString('base64')

    const requestJson = {
        "vault_id": vault_id,
        "signer_type": "api_signer",
        "type": "black_box_signature",
        "details": {
            "format": "hash_binary",
            "hash_binary": hashBase64,
        },
    };

    const requestBody = JSON.stringify(requestJson)
    const path = "/api/v1/transactions"
    const timestamp = new Date().getTime();
    const payload = `${path}|${timestamp}|${requestBody}`;

    const privateKeyFile = "./private.pem"
    const secretPem = readFileSync(privateKeyFile, 'utf8');
    const privateKey = crypto.createPrivateKey(secretPem);
    const sign = crypto.createSign('SHA256').update(payload, 'utf8').end();
    const signature1 = sign.sign(privateKey, 'base64');


    let response = await fetch(`https://${gatewayHost}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${accessToken}`,
            'X-Timestamp': timestamp.toString(),
            'X-Signature': signature1,
        },
        body: requestBody,
    });
    const responseJson = await response.json();
    let txId = responseJson.id;

    // write tx id (to later fetch the signature)
    txidObj.forDefiTxId = txId;
    writeFileSync(`${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${unsignedTxidFile}.unsignedTx.json`, JSON.stringify(txidObj), "utf8");
    return txId;
}

/**
 * @description - gets the signature from forDefi
 * @param unsignedTxidFile - unsigned transaction file
 * @param withdrawal - whether withdrawl is enabled or not
 * @returns signature
 */
export async function getSignature(unsignedTxidFile: string, withdrawal: boolean = false): Promise<string> {

    const path = "/api/v1/transactions"
    const accessToken = readFileSync("./token", 'utf8');

    let txidObj: UnsignedTxJson | UnsignedWithdrawalTxJson;
    let signedTxObj: SignedTxJson | SignedWithdrawalTxJson;
    if (!withdrawal) {
        txidObj = readUnsignedTxJson(unsignedTxidFile);
        signedTxObj = txidObj as SignedTxJson;
    } else {
        txidObj = readUnsignedWithdrawalTx(unsignedTxidFile);
        signedTxObj = txidObj as SignedWithdrawalTxJson;
    }
    let id = txidObj.forDefiTxId;

    let responseSignature;

    responseSignature = await fetch(`https://${gatewayHost}${path}/${id}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    });

    const responseJson = await responseSignature.json();

    let signatureHex;
    try {
        signatureHex = Buffer.from(responseJson.signatures[0].data, 'base64').toString('hex');
    } catch (e) {
        throw Error("Transaction is not signed yet? " + e)
    }

    signedTxObj.signature = signatureHex;

    mkdirSync(`${forDefiDirectory}/${forDefiSignedTxnDirectory}`, { recursive: true });
    writeFileSync(`${forDefiDirectory}/${forDefiSignedTxnDirectory}/${unsignedTxidFile}.signedTx.json`, JSON.stringify(signedTxObj), "utf8");

    return signatureHex;
}

/**
 * @description Gets the vault public key
 * @param vaultId - the valultid
 * @returns returns vault public key
 */
export async function getVaultPublickey(vaultId: string): Promise<string> {

    const path = "/api/v1/vaults"
    const accessToken = readFileSync("./token", 'utf8');

    let response = await fetch(`https://${gatewayHost}${path}/${vaultId}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`
        }
    });
    const responseJson = await response.json();

    let pubKey = responseJson.public_key_compressed;

    let pubKeyHex = Buffer.from(pubKey, 'base64').toString('hex');

    return pubKeyHex;
}