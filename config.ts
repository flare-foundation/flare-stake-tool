require('dotenv').config('.env')
const Web3 = require('web3')
import { BinTools, Buffer } from 'avalanche'

// learn how to derive hex private key from b58!
let privkCB58 = process.env.PRIVATE_KEY_B58!
let privkHex = process.env.PRIVATE_KEY_HEX!

// derive private key in both b58 and hex if only one is provided
let bintools = BinTools.getInstance()
if (privkHex !== undefined && privkHex !== '') {
  let privkBuf = bintools.addChecksum(Buffer.from(privkHex, 'hex'))
  privkCB58 = bintools.bufferToB58(privkBuf)
} else if (privkCB58 !== undefined && privkCB58 !== '') {
  let privkBuf = bintools.cb58Decode(privkCB58)
  privkHex = privkBuf.toString('hex')
} else throw Error('Private key has to be provided in either hex or cb58')

const web3 = new Web3('http://localhost:9650/ext/')
let cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
let cAddressHex: string = cAccount.address.toLowerCase()

module.exports = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
  cAddressHex: cAddressHex,
  privateKeyHex: privkHex,
  privateKey: privkCB58,
}
