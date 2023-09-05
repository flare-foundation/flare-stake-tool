import * as util from 'ethereumjs-util'
import Web3 from 'web3'
import { ethers, Transaction, Signature } from "ethers"
import { exit } from 'process';
import { prefix0x, unPrefix0x } from '../src/utils'

const chainIdFlare = 14
const chainIdCostwo = 114
const chainId = chainIdFlare

var rawUnsignedTransaction = {
    nonce: 1,
    gasPrice: 500000000000,
    gasLimit: 100000,
    to: '0xe34BDff68a5b89216D7f6021c1AB25c012142425',
    value: 1,
    chainId: chainId
}

const ethersTx = Transaction.from(rawUnsignedTransaction)
console.log("unsigned tx hash:", ethersTx.unsignedHash) // keccak256(ethersTx.serialized)

// sign tx with ledger
const signedTx = "0x3f6b0cab76fe5921e6496fdf388d60ad11b9dc7136a8b66b496e4c1c8c3233192833c0e9dce54e403ebeb08de1b38085e4e17e39355adc58edd5639fd81368d21c"

// sign raw tx with hash signature
ethersTx.signature = Signature.from(signedTx)

const web3 = new Web3('https://flare.space/frpc1')

web3.eth.sendSignedTransaction(ethersTx.serialized)
  .on('transactionHash', (hash) => {
    console.log('Transaction hash:', hash)
  })
  .on('receipt', (receipt) => {
    console.log('Transaction receipt:', receipt)
  })
  .on('error', (error) => {
    console.error('Failed to send transaction:', error)
  })