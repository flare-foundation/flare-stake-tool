import * as util from 'ethereumjs-util'
import Web3 from 'web3'
const EthereumTx = require('ethereumjs-tx').Transaction

const chainIdFlare = 14
const chainIdCostwo = 114
const chainId = chainIdFlare

var rawUnsignedTransaction = {
    nonce: 1,
    gasPrice: 500000000000,
    gasLimit: 100000,
    to: '0xe34BDff68a5b89216D7f6021c1AB25c012142425',
    value: 1e18,
    chainId: chainId
}

const tx = new EthereumTx(rawUnsignedTransaction, { chainId: chainId })
tx._common._chainParams.chainId = chainId
tx._common._chainParams.networkId = chainId

const serializedUnsignedTx = tx.serialize()
const serializedUnsignedTxHash = util.sha256(serializedUnsignedTx)
console.log("serialized unsigned", serializedUnsignedTxHash.toString('hex'))

// use ledger to sign txHash
const signedTx = "0xf385087e5519549790976f1d59bc7398116ef1179c852316bd97eb0467ab046d45b679e5e33275bb9ab51d680163784bfd9fa0508dfed13ad0bd653f5ddcbfdc1c"
console.log("signed hash:", signedTx)

// decode and sign manually
const decodedSignature = util.fromRpcSig(signedTx)
tx.r = decodedSignature.r
tx.s = decodedSignature.s
tx.v = decodedSignature.v

console.log("r:", tx.r.toString('hex'))
console.log("v:", tx.v.toString('hex'))

const publicKeyIsEven = tx.v.toString('hex') == '1b'
const v = chainId * 2 + (publicKeyIsEven ? 0 : 1) + 35
tx.v = Buffer.from(v.toString(16), 'hex')

const serializedSignedTx: Buffer = tx.serialize()
const rawSignedTransaction = '0x' + serializedSignedTx.toString('hex')

import { ethers, Transaction } from 'ethers';

const ethersTx = Transaction.from(rawSignedTransaction)
console.log(ethersTx.from)
console.log(ethersTx.signature)
console.log(ethersTx.serialized)
console.log(rawSignedTransaction)

const web3 = new Web3('https://flare.space/frpc1')
//const web3 = new Web3('https://coston2-api.flare.network/ext/C/rpc')

web3.eth.sendSignedTransaction(rawSignedTransaction)
  .on('transactionHash', (hash) => {
    console.log('Transaction hash:', hash)
  })
  .on('receipt', (receipt) => {
    console.log('Transaction receipt:', receipt)
  })
  .on('error', (error) => {
    console.error('Failed to send transaction:', error)
  })