require("dotenv").config('.env')
import { Avalanche, BinTools, Buffer, BN } from "avalanche"

let hexprivatekey = process.env.PRIVATEKEY!

let bintools = BinTools.getInstance()
let privkBuffer = bintools.addChecksum(Buffer.from(hexprivatekey, 'hex'))
let privkB58 = bintools.bufferToB58(privkBuffer)

module.exports = {
  protocol: "https",
  ip: "api.avax-test.network",
  port: 443,
  networkID: 5,
  privateKey: privkB58,
  publicKeyC: process.env.CHEXADDRESS,
  mnemonic: process.env.MNEMONIC,
}