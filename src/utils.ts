import { bech32 } from 'bech32'
import { sha256, ripemd160 } from 'ethereumjs-util'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import * as elliptic from "elliptic"
import BN from "bn.js"

//////////////////////////////////////////////////////////////////////////////////////////
// public keys and bech32 addresses

const EC: typeof elliptic.ec = elliptic.ec
const ec: elliptic.ec = new EC("secp256k1")

export function privateKeyToPublicKey(privateKey: Buffer): Buffer[] {
  const keyPair = ec.keyFromPrivate(privateKey).getPublic()
  const x = keyPair.getX().toBuffer(undefined, 32)
  const y = keyPair.getY().toBuffer(undefined, 32)
  return [x, y]
}

export function decodePublicKey(publicKey: string): Buffer[] {
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
  return ripemd160(sha256(compressed), false)
}

export function publicKeyToBech32AddressString(hrp: string, publicKey: string) {
  const [pubX, pubY] = decodePublicKey(publicKey)
  const addressBuffer = publicKeyToBech32AddressBuffer(pubX, pubY)
  return `${bech32.encode(hrp, bech32.toWords(addressBuffer))}`
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