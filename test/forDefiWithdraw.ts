const fetch = require('node-fetch')
import { readFileSync, writeFileSync } from 'fs'
import crypto from "crypto"
import { prefix0x, sleepms, unPrefix0x } from "../src/utils"
import Web3 from 'web3';
import { Transaction, recoverAddress, keccak256, sha256, Signature } from "ethers";


const accessToken = readFileSync("../token", 'utf8');
const gatewayHost = "api.fordefi.com"

export async function sendToForDefi() {

    const vault_id = "9e89c940-8e60-44d3-ac1b-a21b79c77e1e"; // 'AjHnyOtLftosCGQcmn/6Ec0pbKd1l732b7jXKY6Brnej'
    // fe5f776d-e844-4603-a65b-9a218da22db1


    let web3 = new Web3("https://coston2-api.flare.network/ext/C/rpc");
    const nonce = await web3.eth.getTransactionCount("0x7c25167063377fc773a604d75bd695893f34e905");
    const toBN = web3.utils.toBN;


    var rawTx = {
        nonce: nonce,
        gasPrice: 500000000000,
        gasLimit: 8000000,
        to: '0xE01e4B85be84Fca554a36Af2F29A80247D88B2B4',
        value: (1 * 10**18).toString(),
        chainId: 114
    }

    // serialized unsigned transaction
    const ethersTx = Transaction.from(rawTx)
    let hash = unPrefix0x(ethersTx.unsignedHash);

    var base64String = Buffer.from(hash, 'hex').toString('base64')

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


    // Obtain the signature result
    let transaction_id = responseJson["id"];
    console.log("id", transaction_id)

    await sleepms(7000);

    let responseSignature = await fetch(`https://${gatewayHost}${path}/${transaction_id}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    });
    const responseSignatureJson = await responseSignature.json();
    // console.log("responseSignature", responseSignatureJson)
    let signatureBase64 = responseSignatureJson["signatures"][0]["data"];
    let signature = Buffer.from(signatureBase64, 'base64').toString('hex')
    console.log(signature);

    ethersTx.signature = prefix0x(signature);
    const serializedSigned = ethersTx.serialized;

    web3.eth.sendSignedTransaction(serializedSigned)
    .on('transactionHash', (hash: any) => {
        console.log('Transaction hash:', hash)
    })
    .on('receipt', (receipt: any) => {
        console.log('Transaction receipt:', receipt)
    })
    .on('error', (error: any) => {
        console.error('Failed to send transaction:', error)
    })

    // return transaction_id;
    // return Buffer.from(signature, 'base64').toString('hex')


}

sendToForDefi().then(console.log).catch(console.log);
