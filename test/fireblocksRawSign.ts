const fs = require('fs');
const path = require('path');
import Web3 from "web3";
import { FireblocksSDK, TransactionOperation, SigningAlgorithm } from "fireblocks-sdk"
import { Transaction, Signature } from "ethers"
import { sleepms, prefix0x, unPrefix0x, recoverTransactionSigner, recoverPublicKey }  from "../src/utils"

const apiSecret = fs.readFileSync(path.resolve("./fireblocks_secret_tv.key"), "utf8"); // api-secret
const apiKey = "" // the api-key
// Choose the right api url for your workspace type
const baseUrl = "https://sandbox-api.fireblocks.io";
const fireblocks = new FireblocksSDK(apiSecret, apiKey, baseUrl);

async function fireblocksSign(content: string) {
    const { id } = await fireblocks.createTransaction({
        operation: TransactionOperation.RAW,
        extraParameters: {
            rawMessageData: {
                messages: [{
                    content: content,
                    derivationPath: [44, 1, 0, 0, 0]
                }],
                algorithm: SigningAlgorithm.MPC_ECDSA_SECP256K1
            }
        }
    });
    await sleepms(5000);
    let txInfo = await fireblocks.getTransactionById(id);
    const signature = txInfo.signedMessages![0].signature;
    const postfix = (signature.v! + 27).toString(16)
    //const postfix = (114 * 2 + signature.v! + 35).toString(16)
    return signature.fullSig + postfix
}

async function signTransaction(rawTx: any) {
    const ethersTx = Transaction.from(rawTx)
    console.log("unsigned tx hash:", ethersTx.unsignedHash) // keccak256(ethersTx.serialized)
    const signature = await fireblocksSign(unPrefix0x(ethersTx.unsignedHash))
    ethersTx.signature = Signature.from(prefix0x(signature)) // sign tx
    return ethersTx.serialized
}

async function sendRawTx(web3: Web3, rawTx: any) {
    const signedTx = await signTransaction(rawTx)
    await web3.eth.sendSignedTransaction(signedTx)
        .on('transactionHash', (hash: any) => {
            console.log('Transaction hash:', hash)
        })
        .on('receipt', (receipt: any) => {
            console.log('Transaction receipt:', receipt)
        })
        .on('error', (error: any) => {
            console.error('Failed to send transaction:', error)
        })
}

async function main(message: string) {
    const signature = await fireblocksSign(message)
    console.log(`signature: ${signature}`)
    const publicKey = recoverPublicKey(Buffer.from(unPrefix0x(message), 'hex'), prefix0x(signature))
    console.log(`public key: ${publicKey.toString('hex')}`)
    const signer = recoverTransactionSigner(Buffer.from(unPrefix0x(message), 'hex'), prefix0x(signature))
    console.log(`signer: ${signer}`)
}

const costwoChainId = 14
const flareChainId = 114
const chainId = costwoChainId

var rawTx = {
    gasPrice: 500000000000,
    gasLimit: 100000,
    to: '0xe34BDff68a5b89216D7f6021c1AB25c012142425',
    value: "1000000000000000000",
    chainId: chainId
}
let web3 = new Web3('https://flare.space/frpc1');
//let web3 = new Web3('coston2-api.flare.network')

const message = '7b781585cd18355f28d6cb2e15f40bc04de86bde5cc845f34293dd2d0ab83055'
const signature = '02c0b7f46f0984fc3de1a1bbe284b8d42c8ca4feb65346906d2ed76ebac143f23d31dd344428f0b2a612ba085b2e17f340a28085bcbeedd356c432b65c62ab0b1b'
main(message)
