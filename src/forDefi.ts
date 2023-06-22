
const fetch = require('node-fetch')
import { readFileSync, writeFileSync } from 'fs'
import crypto from "crypto"
import { sleepms, unPrefix0x, readUnsignedTx } from "../src/utils"
import * as dotenv from 'dotenv'
dotenv.config()

const accessToken = process.env.ACCESS_TOKEN;
const apiSIgnerPrivateKey = process.env.API_SIGNER_PRIVATE_KEY;
const gatewayHost = "api.fordefi.com"


export async function sendToForDefi(unsignedTxidFile: string): Promise<string> {

    const vault_id = process.env.VAULT_ID;

    // // vaultPublicKey should match PUBLIC_KEY in .env file
    // let vaultPublicKey = await getVaultPublickey(vault_id!);

    // if (unPrefix0x(process.env.PUBLIC_KEY!) != vaultPublicKey) {
    //     throw Error('public key does not match the vault')
    // }

    let txidObj = readUnsignedTx(unsignedTxidFile);
    let hash = txidObj.signatureRequests[0].message;
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

    const privateKey = crypto.createPrivateKey(apiSIgnerPrivateKey!);
    const sign = crypto.createSign('SHA256').update(payload, 'utf8').end();
    const signature1 = sign.sign(privateKey, 'base64');


    let response = await fetch(`https://${gatewayHost}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${accessToken}`,
            'X-Timestamp': timestamp,
            'X-Signature': signature1,
        },
        body: requestBody,
    });
    const responseJson = await response.json();
    let txId = responseJson.id;

    // write tx id (to later fetch the signature)
    txidObj.forDefiTxId = txId;
    writeFileSync(`${unsignedTxidFile}.unsignedTx.json`, JSON.stringify(txidObj), "utf8");
    console.log(txId);
    return txId;
}

export async function getSignature(unsignedTxidFile: string): Promise<string> {

    const path = "/api/v1/transactions"

    let txidObj = readUnsignedTx(unsignedTxidFile);
    let id = txidObj.forDefiTxId;
    console.log(id)

    let responseSignature = await fetch(`https://${gatewayHost}${path}/${id}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    });

    const responseJson = await responseSignature.json();
    console.log(responseJson)
    let signatureHex = Buffer.from(responseJson.signatures[0].data, 'base64').toString('hex');

    let signedTxid = {
        signature: signatureHex
    }


    writeFileSync(`${unsignedTxidFile}.signedTx.json`, JSON.stringify(signedTxid), "utf8");

    console.log(JSON.stringify(signedTxid))
    return JSON.stringify(signedTxid);
}

export async function getSignatures(transactionIds: string[]): Promise<string> {

    const gatewayHost = "api.fordefi.com"
    const path = "/api/v1/transactions"

    let signatures: any[] = [];
    let transactions = JSON.parse(readFileSync(`transactions.json`, 'utf8'));


    for (let i = 0; i < transactionIds.length; i++) {
        let id = transactionIds[i];
        console.log("id", id)

        let responseSignature = await fetch(`https://${gatewayHost}${path}/${id}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        const responseJson = await responseSignature.json();
        let signatureHex = Buffer.from(responseJson.signatures[0].data, 'base64').toString('hex');

        signatures.push({
            transactionId: id,
            signature: signatureHex
        });

        // match signature with transaction data
        for (let i = 0; i < transactions.length; i++) {
            if (transactions[i].id == id) {
                transactions[i].signature = signatureHex
            }
        }
    }

    writeFileSync(`transactions`, JSON.stringify(transactions), "utf8");

    // const signaturesCSV = parse(signatures);
    // writeFileSync(`signatures.csv`, signaturesCSV, "utf8");
    console.log(JSON.stringify(signatures))
    return JSON.stringify(signatures);
}

async function getVaultPublickey(vaultId: string): Promise<string> {

    const path = "/api/v1/vaults"

    let response = await fetch(`https://${gatewayHost}${path}/${vaultId}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`
        }
    });
    const responseJson = await response.json();

    let pubKey = responseJson.public_key_compressed;

    let pubKeyHex = Buffer.from(pubKey, 'base64').toString('hex');
    console.log(pubKeyHex);

    return pubKeyHex;
}


// sendToForDefi("test1");

getSignature("test1");