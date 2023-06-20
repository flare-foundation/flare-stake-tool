
const fetch = require('node-fetch')
import { readFileSync, writeFileSync } from 'fs'
import crypto from "crypto"
import { sleepms, publicKeyToEthereumAddressString } from "../src/utils"
import { parse } from 'json2csv';

const accessToken = "eyJhbGciOiJFZERTQSIsImtpZCI6ImZ3MFc3aVpocUc0SUEzaXV4ZmhQIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2FwaS5mb3JkZWZpLmNvbS8iLCJzdWIiOiI2MzVjMTcwOC1iYzhkLTQ4N2UtYjQwZC0zZjk0ODE0NmI0OWFAZm9yZGVmaSIsImF1ZCI6WyJodHRwczovL2FwaS5mb3JkZWZpLmNvbS9hcGkvIl0sImV4cCI6LTY3OTUzNjQ1NzksImlhdCI6MTY4NzE2MjQwOCwianRpIjoiMjViMDg2NjMtNjJlMC00MzRkLWI2MjgtZGQwNmJhMzk1NzQzIn0.cvh25D0cFIzZMjmNoyTdl9RwtX01WpTkuOT_ogwSKbjv-Q21CQFGSDPYionHtQE72TLhdeBWkhOmRJmoH0A0CQ"

const gatewayHost = "api.fordefi.com"


async function sendToForDefi(hash: string): Promise<string> {

    const vault_id = "9e89c940-8e60-44d3-ac1b-a21b79c77e1e"; // 'AjHnyOtLftosCGQcmn/6Ec0pbKd1l732b7jXKY6Brnej'
    // fe5f776d-e844-4603-a65b-9a218da22db1

    const hashString = "2c4384fbde436b3d6ce597bc36fff82734d4a921fd0aa4512cc17f0fb67796b7";
    // const buffer = Buffer.from("2c4384fbde436b3d6ce597bc36fff82734d4a921fd0aa4512cc17f0fb67796b7", "hex");
    // const buffer64 = base64.encode(hash);
    // console.log(buffer64);
    var base64String = Buffer.from(hashString, 'hex').toString('base64')

    const requestJson = {
        "vault_id": vault_id,
        "signer_type": "api_signer",
        "type": "black_box_signature",
        "details": {
            "format": "hash_binary",
            "hash_binary": base64String,
        },
    };


    const requestBody = JSON.stringify(requestJson)
    const path = "/api/v1/transactions"
    const privateKeyFile = "./private.pem"
    const timestamp = new Date().getTime();
    const payload = `${path}|${timestamp}|${requestBody}`;

    const secretPem = readFileSync(privateKeyFile, 'utf8');
    const privateKey = crypto.createPrivateKey(secretPem);
    const sign = crypto.createSign('SHA256').update(payload, 'utf8').end();
    const signature = sign.sign(privateKey, 'base64');


    let response = await fetch(`https://${gatewayHost}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${accessToken}`,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
        },
        body: requestBody,
    });
    const responseJson = await response.json();
    console.log(responseJson)


    // Obtain the signature result
    let transaction_id = responseJson["id"];
    console.log("id", transaction_id)

    await sleepms(10000);

    let responseSignature = await fetch(`https://${gatewayHost}${path}/${transaction_id}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    });
    const responseSignatureJson = await responseSignature.json();
    console.log("responseSignature", responseSignatureJson)
    let r = responseSignatureJson["details"]["signature"]["r"]
    let s = responseSignatureJson["details"]["signature"]["s"]
    console.log("r", r);
    console.log("s", s);

    return transaction_id;
}

export async function getSignatures(transactionIds: string[]): Promise<string> {

    const accessToken = "eyJhbGciOiJFZERTQSIsImtpZCI6ImZ3MFc3aVpocUc0SUEzaXV4ZmhQIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2FwaS5mb3JkZWZpLmNvbS8iLCJzdWIiOiI2MzVjMTcwOC1iYzhkLTQ4N2UtYjQwZC0zZjk0ODE0NmI0OWFAZm9yZGVmaSIsImF1ZCI6WyJodHRwczovL2FwaS5mb3JkZWZpLmNvbS9hcGkvIl0sImV4cCI6LTY3OTUzNjQ1NzksImlhdCI6MTY4NzE2MjQwOCwianRpIjoiMjViMDg2NjMtNjJlMC00MzRkLWI2MjgtZGQwNmJhMzk1NzQzIn0.cvh25D0cFIzZMjmNoyTdl9RwtX01WpTkuOT_ogwSKbjv-Q21CQFGSDPYionHtQE72TLhdeBWkhOmRJmoH0A0CQ"

    const gatewayHost = "api.fordefi.com"
    const path = "/api/v1/transactions"

    let signatures: any[] = [];

    console.log("ids", transactionIds)

    for (let i = 0; i < transactionIds.length; i++) {
        console.log("id", transactionIds[i])
        let responseSignature = await fetch(`https://${gatewayHost}${path}/${transactionIds[i]}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });
        const responseJson = await responseSignature.json();
        let r = responseJson["details"]["signature"]["r"];
        let s = responseJson["details"]["signature"]["s"];

        signatures.push({
            transactionId: transactionIds[i],
            r: r,
            s: s
        });

        const signaturesCSV = parse(signatures);
        writeFileSync(`signatures.csv`, signaturesCSV, "utf8");
    }

    return JSON.stringify(signatures);

}

async function createVault(vaultName: string): Promise<string> {

    const requestJson = {
        "type": "black_box",
        "key_type": "ecdsa_secp256k1",
        "name": vaultName
    };

    const requestBody = JSON.stringify(requestJson)
    const path = "/api/v1/vaults"

    let response = await fetch(`https://${gatewayHost}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${accessToken}`
        },
        body: requestBody,
    });
    const responseJson = await response.json();
    console.log(responseJson)

    return responseJson["id"];
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

    let pubKey = responseJson["public_key_compressed"];
    console.log(responseJson["public_key_compressed"]);

    let pubKeyHex = Buffer.from(pubKey, 'base64').toString('hex');
    console.log(pubKeyHex);

    let x = publicKeyToEthereumAddressString(pubKeyHex);
    console.log(x);
    return responseJson["public_key_compressed"];
}

// createVault("testEcdsa")

// getVaultPublickey("9e89c940-8e60-44d3-ac1b-a21b79c77e1e")

sendToForDefi("2c4384fbde436b3d6ce597bc36fff82734d4a921fd0aa4512cc17f0fb67796b7");

// getSignatures(["25e2f4df-8b0d-48d2-9426-64a12579b35e"]);
