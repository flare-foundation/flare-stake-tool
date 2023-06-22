
const fetch = require('node-fetch')
import { readFileSync, writeFileSync } from 'fs'
import crypto from "crypto"
import { sleepms, unPrefix0x } from "../src/utils"
import { parse } from 'json2csv';
import * as dotenv from 'dotenv'
dotenv.config()

const accessToken = process.env.ACCESS_TOKEN;
const apiSIgnerPrivateKey = process.env.API_SIGNER_PRIVATE_KEY;
const gatewayHost = "api.fordefi.com"


export async function sendToForDefi(hash: string): Promise<string> {

    // const vault_id = "9e89c940-8e60-44d3-ac1b-a21b79c77e1e"; // 'AjHnyOtLftosCGQcmn/6Ec0pbKd1l732b7jXKY6Brnej'
    const vault_id = process.env.VAULT_ID;

    // // vaultPublicKey should match PUBLIC_KEY in .env file
    // let vaultPublicKey = await getVaultPublickey(vault_id!);

    // if (unPrefix0x(process.env.PUBLIC_KEY!) != vaultPublicKey) {
    //     throw Error('public key does not match the vault')
    // }

    var hashBase64 = Buffer.from(hash, 'hex').toString('base64')

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
    // console.log(responseJson)
    let txId = responseJson.id;

    let transactions = JSON.parse(readFileSync(`transactions.json`, 'utf8'));

    for (let i = 0; i < transactions.length; i++) {
        if (transactions[i].hash == hash) {
            transactions[i].id = txId
        }
    }
    writeFileSync(`transactions.json`, JSON.stringify(transactions), "utf8");

    return txId;


    // // Obtain the signature result
    // let transaction_id = responseJson["id"];
    // console.log("id", transaction_id)

    // await sleepms(10000);

    // let responseSignature = await fetch(`https://${gatewayHost}${path}/${transaction_id}`, {
    //     method: 'GET',
    //     headers: {
    //         "Authorization": `Bearer ${accessToken}`,
    //     },
    // });
    // const responseSignatureJson = await responseSignature.json();
    // // console.log("responseSignature", responseSignatureJson)
    // let signature = responseSignatureJson["signatures"][0]["data"];
    // console.log(Buffer.from(signature, 'base64').toString('hex'));

    // // return transaction_id;
    // return Buffer.from(signature, 'base64').toString('hex');
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

    writeFileSync(`transactions.json`, JSON.stringify(transactions), "utf8");

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


sendToForDefi("bf8cae4adf374213feb76c55f624746c50d7af68821a6776f9e9f9229b1ef90a");
//
// getSignatures(["91110240-8688-4ce3-94a8-e5d247f38e13"]);
