import * as ethutil from 'ethereumjs-util'
import * as elliptic from "elliptic"
import fs from 'fs'
import { bech32 } from 'bech32'
import { BN } from '@flarenetwork/flarejs/dist'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { EcdsaSignature } from "@flarenetwork/flarejs/dist/common"
import { UnsignedTx as EvmUnsignedTx } from '@flarenetwork/flarejs/dist/apis/evm'
import { UnsignedTx as PvmUnsignedTx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnsignedTxJson } from './interfaces'
import { sha256 } from 'ethereumjs-util'

//////////////////////////////////////////////////////////////////////////////////////////
// public keys and bech32 addresses

const EC: typeof elliptic.ec = elliptic.ec
const ec: elliptic.ec = new EC("secp256k1")

export function privateKeyToEncodedPublicKey(privateKey: string, compress: boolean = true): string {
  const keyPair = ec.keyFromPrivate(privateKey)
  return keyPair.getPublic().encode("hex", compress)
}

export function privateKeyToPublicKey(privateKey: Buffer): Buffer[] {
  const keyPair = ec.keyFromPrivate(privateKey).getPublic()
  const x = keyPair.getX().toBuffer(undefined, 32)
  const y = keyPair.getY().toBuffer(undefined, 32)
  return [x, y]
}

export function decodePublicKey(publicKey: string): [Buffer, Buffer] {
  let x: Buffer
  let y: Buffer
  publicKey = unPrefix0x(publicKey)
  if (publicKey.length == 128) {
    // ethereum specific public key encoding
    x = Buffer.from(publicKey.slice(0, 64), "hex")
    y = Buffer.from(publicKey.slice(64), "hex")
  } else {
    const keyPair = ec.keyFromPublic(publicKey, 'hex').getPublic()
    x = keyPair.getX().toBuffer(undefined, 32)
    y = keyPair.getY().toBuffer(undefined, 32)
  }
  return [x, y]
}

export function compressPublicKey(x: Buffer, y: Buffer): Buffer {
  return Buffer.from(
    ec.keyFromPublic({
      x: x.toString('hex'),
      y: y.toString('hex')
    }).getPublic().encode("hex", true),
  "hex")
}

function publicKeyToBech32AddressBuffer(x: Buffer, y: Buffer) {
  const compressed = compressPublicKey(x, y)
  return ethutil.ripemd160(ethutil.sha256(compressed), false)
}

export function publicKeyToBech32AddressString(publicKey: string, hrp: string) {
  const [pubX, pubY] = decodePublicKey(publicKey)
  const addressBuffer = publicKeyToBech32AddressBuffer(pubX, pubY)
  return `${bech32.encode(hrp, bech32.toWords(addressBuffer))}`
}

export function publicKeyToEthereumAddressString(publicKey: string) {
  const [pubX, pubY] = decodePublicKey(publicKey)
  const decompressedPubk = Buffer.concat([pubX, pubY])
  const ethAddress = ethutil.publicToAddress(decompressedPubk)
  return prefix0x(ethAddress.toString('hex'))
}

/////////////////////////////////////////////////////////////////////////////////////////
// signatures

export function recoverMessageSigner(message: Buffer, signature: string) {
    const messageHash = ethutil.hashPersonalMessage(message)
    return recoverTransactionSigner(messageHash, signature)
}

export function recoverTransactionSigner(message: Buffer, signature: string) {
    let split = ethutil.fromRpcSig(signature);
    let publicKey = ethutil.ecrecover(message, split.v, split.r, split.s);
    let signer = ethutil.pubToAddress(publicKey).toString("hex");
    return signer;
}

export function recoverPublicKey(message: Buffer, signature: string): Buffer {
  const split = ethutil.fromRpcSig(signature)
  return ethutil.ecrecover(message, split.v, split.r, split.s)
}

export function expandSignature(signature: string): EcdsaSignature {
  let recoveryParam = parseInt(signature.slice(128, 130), 16)
  if (recoveryParam === 27 || recoveryParam === 28) recoveryParam -= 27
  return {
    r: new BN(signature.slice(0, 64), 'hex'),
    s: new BN(signature.slice(64, 128), 'hex'),
    recoveryParam: recoveryParam
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// general helper functions

export async function sleepms(milliseconds: number) {
  await new Promise((resolve: any) => {
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })
}

export function unPrefix0x(tx: string) {
  if (!tx) {
    return '0x0'
  }
  return tx.startsWith('0x') ? tx.slice(2) : tx
}

export function prefix0x(hexString: string) {
  return hexString.startsWith("0x") ? hexString : "0x" + unPrefix0x(hexString)
}

export function decimalToInteger(dec: string, n: number): string {
  let ret = dec
  if (ret.includes('.')) {
    const split = ret.split('.')
    ret = split[0] + split[1].slice(0,n).padEnd(n,'0')
  } else {
    ret = ret + '0'.repeat(n)
  }
  return ret
}

export function integerToDecimal(int: string, n: number): string {
  int = int.padStart(n, '0')
  const part1 = int.slice(0,-n)
  const part2 = int.slice(-n)
  return part1 + '.' + part2
}

export function parseRelativeTime(time: string): string {
  // assume time starts with now+
  return UnixNow().add(new BN(time.split('+')[1])).toString()
}

//////////////////////////////////////////////////////////////////////////////////////////
// serialization of atomic c-chain addresses does not work correctly, so we have to improvise


export function serializeExportCP_args(args: [BN, string, string, string, string, string[], number, BN, number, BN?]): string {
  [0,7,9].map(i => args[i] = args[i]!.toString(16))
  return JSON.stringify(args, null, 2)
}

export function deserializeExportCP_args(serargs: string): [BN, string, string, string, string, string[], number, BN, number, BN?] {
  const args = JSON.parse(serargs);
  [0,7,9].map(i => args[i] = new BN(args[i], 16))
  return args
}

export function serializeUnsignedTx(unsignedTx: EvmUnsignedTx | PvmUnsignedTx): string {
  return JSON.stringify(unsignedTx.serialize("hex"), null, 2)
}

export function deserializeUnsignedTx<UnsignedTx extends EvmUnsignedTx | PvmUnsignedTx>(
  type: { new(): UnsignedTx }, serialized: string
): UnsignedTx {
  const unsignedTx: UnsignedTx = new type()
  unsignedTx.deserialize(JSON.parse(serialized))
  return unsignedTx
}


//////////////////////////////////////////////////////////////////////////////////////////
// storage

export function saveUnsignedTx(unsignedTx: UnsignedTxJson, id: string): void {
  const fname = `${id}.unsignedTx`
  if (fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} already exists`)
  }
  const serialization = JSON.stringify(unsignedTx, null, 2)
  fs.writeFileSync(fname, serialization)
}

export function readUnsignedTx(id: string): UnsignedTxJson {
  const fname = `${id}.unsignedTx`
  if (!fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  return JSON.parse(serialization) as UnsignedTxJson
}