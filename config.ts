require("dotenv").config('.env')
const Web3 = require('web3')
import { BinTools, Buffer } from "avalanche"

const web3 = new Web3(Web3.givenProvider || "ws://localhost:8546")

let privateKeyHex = process.env.PRIVATE_KEY!
const cAccount = web3.eth.accounts.privateKeyToAccount(privateKeyHex)
const cAddressHex: string = cAccount.address.toLowerCase()

let bintools = BinTools.getInstance()
let privkBuffer = bintools.addChecksum(Buffer.from(privateKeyHex, 'hex'))
let privkB58 = bintools.bufferToB58(privkBuffer)

module.exports = {
	protocol: "https",
	ip: "api.avax-test.network",
	port: 443,
	networkID: 5,
	cAddressHex: cAddressHex,
	privateKeyHex: privateKeyHex,
	privateKey: privkB58
}