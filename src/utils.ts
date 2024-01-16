import fs from 'fs'
import * as ethutil from 'ethereumjs-util'
import * as elliptic from "elliptic"
import { bech32 } from 'bech32'
import { BN } from '@flarenetwork/flarejs/dist'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { EcdsaSignature } from "@flarenetwork/flarejs/dist/common"
import { UnsignedTx as EvmUnsignedTx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/evm'
import { UnsignedTx as PvmUnsignedTx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { SignedTxJson, UnsignedTxJson, ContextFile, Context } from './interfaces'
import { forDefiDirectory, forDefiSignedTxnDirectory, forDefiUnsignedTxnDirectory } from './constants/forDefi'

//////////////////////////////////////////////////////////////////////////////////////////
// public keys and bech32 addresses

const ec: elliptic.ec = new elliptic.ec("secp256k1")

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
  publicKey = unPrefix0x(publicKey)
  if (publicKey.length == 128) {
    publicKey = "04" + publicKey
  }
  const keyPair = ec.keyFromPublic(publicKey, 'hex').getPublic()
  const x = keyPair.getX().toBuffer(undefined, 32)
  const y = keyPair.getY().toBuffer(undefined, 32)
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

export function publicKeyToBech32AddressBuffer(x: Buffer, y: Buffer) {
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

export function validatePublicKey(publicKey: string): boolean {
  try {
    decodePublicKey(publicKey)
    return true
  } catch (error) {
    return false
  }
}

/////////////////////////////////////////////////////////////////////////////////////////
// signatures

export function recoverMessageSigner(message: Buffer, signature: string) {
  const messageHash = ethutil.hashPersonalMessage(message)
  return recoverTransactionSigner(messageHash, signature)
}

export function recoverTransactionSigner(message: Buffer, signature: string) {
  let split = ethutil.fromRpcSig(signature)
  let publicKey = ethutil.ecrecover(message, split.v, split.r, split.s)
  let signer = ethutil.pubToAddress(publicKey).toString("hex")
  return signer
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
  if (!hexString) {
    return '0x0'
  }
  return hexString.startsWith("0x") ? hexString : "0x" + unPrefix0x(hexString)
}

export function decimalToInteger(dec: string, offset: number): string {
  let ret = dec
  if (ret.includes('.')) {
    const split = ret.split('.')
    ret = split[0] + split[1].slice(0, offset).padEnd(offset, '0')
  } else {
    ret = ret + '0'.repeat(offset)
  }
  return ret
}

export function integerToDecimal(int: string, offset: number): string {
  if (int === '0') {
    return '0'
  }
  int = int.padStart(offset, '0')
  const part1 = int.slice(0, -offset) || "0"
  const part2 = int.slice(-offset).replace(/0+$/, '');
  return part1 + (part2 === "" ? "" : '.' + part2)
}

export function parseRelativeTime(time: string): string {
  // assume time starts with now+
  return UnixNow().add(new BN(time.split('+')[1])).toString()
}

export function toBN(num: number | string | BN | undefined): BN | undefined {
  return num ? new BN(num) : undefined
}

//////////////////////////////////////////////////////////////////////////////////////////
// serialization of atomic c-chain addresses does not work correctly, so we have to improvise

export function serializeExportCP_args(args: [BN, string, string, string, string, string[], number, BN, number, BN?]): string {
  return JSON.stringify(args, null, 2)
}

export function deserializeExportCP_args(serargs: string): [BN, string, string, string, string, string[], number, BN, number, BN?] {
  const args = JSON.parse(serargs)
    ;[0, 7, 9].map(i => args[i] = new BN(args[i], 16))
  return args
}

export function serializeImportPC_args(args: [UTXOSet, string, string[], string, string[], BN]): string {
  return JSON.stringify([args[0].serialize('hex'), ...args.slice(1)], null, 2)
}

export function deserializeImportPC_args(serargs: string): [UTXOSet, string, string[], string, string[], BN] {
  const args = JSON.parse(serargs)
  const utxoSet = new UTXOSet()
  utxoSet.deserialize(args[0])
  args[0] = utxoSet
  args[5] = new BN(args[5], 16)
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
// key and unsigned/signed transaction storage

export function initCtxJson(contextFile: ContextFile) {
  if (fs.existsSync('ctx.json')) {
    throw new Error('ctx.json already exists')
  }
  fs.writeFileSync('ctx.json', JSON.stringify(contextFile, null, 2))
}

export function saveUnsignedTxJson(unsignedTxJson: UnsignedTxJson, id: string, dir?: string): void {
  if (dir === undefined) dir = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}`
  fs.mkdirSync(dir, { recursive: true })
  const fname = `${dir}/${id}.unsignedTx.json`
  if (fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} already exists`)
  }
  const forDefiHash = Buffer.from(unsignedTxJson.signatureRequests[0].message, 'hex').toString('base64')
  const unsignedTxJsonForDefi: UnsignedTxJson = { ...unsignedTxJson, forDefiHash: forDefiHash }
  const serialization = JSON.stringify(unsignedTxJsonForDefi, null, 2)
  fs.writeFileSync(fname, serialization)
}

export function readUnsignedTxJson(id: string): UnsignedTxJson {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname, 'utf-8').toString()
  return JSON.parse(serialization) as UnsignedTxJson
}

export function readSignedTxJson(id: string): SignedTxJson {
  const fname = `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`signedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  const resp = JSON.parse(serialization) as SignedTxJson
  if (!resp.signature) {
    throw new Error(`unsignedTx file ${fname} does not contain signature`)
  }
  return resp
}

/**
 * @description Adds a flag to the signed txn to indicate it has been submitted to the blockchain
 * @param {string} id Transaction Id used to create the transaction file
 */
export function addFlagForSentSignedTx(id: string) {
  const fname = `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`signedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  const txObj = JSON.parse(serialization) as SignedTxJson
  txObj.isSentToChain = true

  fs.writeFileSync(`${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`, JSON.stringify(txObj), "utf8")
}

/**
 * @description Checks whether the transaction has already been submitted to the blockchain
 * @param {string} id Transaction Id used to create the transaction file
 * @returns {boolean}
 */
export function isAlreadySentToChain(id: string): boolean {
  const fname = `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
  if (!fs.existsSync(fname)) {
    return false
  }
  const serialization = fs.readFileSync(fname).toString()
  const txObj = JSON.parse(serialization) as SignedTxJson

  return txObj.isSentToChain ? true : false
}

//////////////////////////////////////////////////////////////////////////////////////////
// limiting delegation number

function countpAddressInDelegation(validators: any[], pAddressBech32: string): { count: number, validatorNodeIds: string[] } {
  let count = 0
  const validatorNodeIds = []
  for (const item of validators) {
    if (item.delegators) {
      for (const delegator of item.delegators) {
        for (const addr of delegator.rewardOwner.addresses) {
          if (addr.toLowerCase() === pAddressBech32.toLowerCase()) {
            count++;
            validatorNodeIds.push(item.nodeID.toLowerCase())
          }
        }
      }
    }
  }
  return { count, validatorNodeIds }
}

/**
 * @description Count number of p-chain address used for delegation
 * @param {Context} ctx context file
 * @returns number of times p address used in current validators delegation list
 */
export async function delegationAddressCount(ctx: Context) {
  const current = await ctx.pchain.getCurrentValidators()
  const pending = await ctx.pchain.getPendingValidators()
  const pendingValidtaor = JSON.parse(JSON.stringify(pending))
  const pCurrent = JSON.parse(JSON.stringify(current))
  const currentDelegationDetails = countpAddressInDelegation(pCurrent.validators, ctx.pAddressBech32!)
  const pendingDelegationDetails = countpAddressInDelegation(pendingValidtaor.validators, ctx.pAddressBech32!)
  return {count: currentDelegationDetails.count+ pendingDelegationDetails.count, validatorNodeId: [...currentDelegationDetails.validatorNodeIds, ...pendingDelegationDetails.validatorNodeIds]}
}

//////////////////////////////////////////////////////////////////////////////////////////
// finalization

export async function waitFinalize<T>(ctx: Context, prms: Promise<T>): Promise<T> {
  const txcount1 = await ctx.web3.eth.getTransactionCount(ctx.cAddressHex!)
  const resp = await prms
  while (await ctx.web3.eth.getTransactionCount(ctx.cAddressHex!) == txcount1) {
    await sleepms(1000)
  }
  return resp
}
