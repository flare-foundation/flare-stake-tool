import fs from 'fs'
import Web3 from 'web3'
import { utils } from '@flarenetwork/flarejs';
import { Context, ContextFile } from './interfaces'
import {
  flare,
  songbird,
  costwo,
  coston,
  localflare,
  local,
  NetworkConfig
} from './constants/network'
import {
  publicKeyToBech32AddressString,
  publicKeyToEthereumAddressString,
  privateKeyToPublicKey,
  decodePublicKey,
  unPrefix0x
} from './utils'
import * as dotenv from 'dotenv';

/**
 * @param network
 * @returns {string} The RPC url of the given network
 */
export function rpcUrlFromNetworkConfig(network: string): string {
  const config: NetworkConfig = getNetworkConfig(network)
  return `${config.protocol}://${config.ip}/ext/bc/C/rpc`
}

/**
 * @description - parses the file and returns the context of ctx.json
 * @param ctxFile - path to the context file
 * @returns - context
 */
export function readContextFile(ctxFile: string): ContextFile {
  const file = fs.readFileSync(ctxFile, 'utf8')
  return JSON.parse(file) as ContextFile
}

/**
 * @description Returns the context from .env file
 * @param path - path to the .env file
 * @param network - network info. can be localflare, costwo, flare
 * @returns - returns the context from .env file
 */
export function contextEnv(path: string, network: string): Context {
  dotenv.config({ path: path })
  return getContext(
    network,
    process.env.PUBLIC_KEY,
    process.env.PRIVATE_KEY_HEX,
    process.env.PRIVATE_KEY_CB58
  )
}

/**
 * @description - returns context from the file
 * @param ctxFile - path to the context file
 * @returns returns the context
 */
export function contextFile(ctxFile: string): Context {
  const ctx = readContextFile(ctxFile)
  return getContext(ctx.network, ctx.publicKey)
}

/**
 * @description - returns the network from the context file
 * @param ctxFile - context file
 * @returns returns the network from the context
 */
export function networkFromContextFile(ctxFile: string): string {
  const ctx = readContextFile(ctxFile)
  return ctx.network
}

/**
 * @description returns the context
 * @param network - network name: flare/localflare/costwo
 * @param publicKey - public key
 * @param privateKeyHex - private key in hex format
 * @param privateKeyCB58 - private key in cb58 format
 * @returns context
 */
export function getContext(
  network: string,
  publicKey?: string,
  privateKeyHex?: string,
  privateKeyCB58?: string
): Context {
  return context(getNetworkConfig(network), publicKey, privateKeyHex, privateKeyCB58, network)
}

/**
 * @description - returns the network config based on network that was passed
 * @param network - network name: flare/localflare/costwo
 * @returns the network configuration
 */
export function getNetworkConfig(network: string | undefined): NetworkConfig {
  let networkConfig
  if (network == 'flare' || network === undefined) {
    networkConfig = flare
  } else if (network == 'songbird') {
    networkConfig = songbird
  } else if (network == 'costwo') {
    networkConfig = costwo
  } else if (network == 'coston') {
    networkConfig = coston
  } else if (network == 'localflare') {
    networkConfig = localflare
  } else if (network == 'local') {
    networkConfig = local
  } else throw Error('Invalid network')
  return networkConfig
}

/**
 * The main function that returns the cotext
 * @param config - network configuration
 * @param publicKey - public key
 * @param privkHex - private key in hex format
 * @param privkCB58 - private key in cb58 format
 * @param network - network name
 * @returns the context object
 */
export function context(
  config: NetworkConfig,
  publicKey?: string,
  privkHex?: string,
  privkCB58?: string,
  network?: string
): Context {

  const { protocol, ip, port, networkID: _, chainID } = config
  // those two addresses should be derived for most cli applications
  let cAddressHex: string | undefined
  let addressBech32: string | undefined

  // derive private key in both cb58 and hex if only one is provided
  if (privkHex !== undefined && privkHex !== "") {
    privkHex = unPrefix0x(privkHex);
    const privkBuf = Buffer.from(privkHex, "hex");
    privkCB58 = utils.base58check.encode(privkBuf);
  } else if (privkCB58 !== undefined && privkCB58 !== "") {
    const privkBuf = Buffer.from(utils.base58check.decode(privkCB58));
    privkHex = privkBuf.toString("hex");
  }

  // derive the public key coords if private key is present and check that they match
  // the public key if provided
  let publicKeyPair: [Buffer, Buffer] | undefined
  if (publicKey) {
    publicKeyPair = decodePublicKey(publicKey)
    publicKey = '04' + Buffer.concat(publicKeyPair).toString('hex') // standardize
  }
  if (privkHex) {
    const [pubX, pubY] = privateKeyToPublicKey(Buffer.from(privkHex, 'hex'))
    if (publicKey) {
      if (!publicKeyPair) {
        throw Error('public key pair is not defined')
      }
      if (!publicKeyPair[0].equals(pubX) || !publicKeyPair[1].equals(pubY)) {
        throw Error('provided private key does not match the public key')
      }
    }
    publicKeyPair = [pubX, pubY]
    if (!publicKey) {
      publicKey = '04' + Buffer.concat(publicKeyPair).toString('hex') // standardize
    }
  }

  const path = '/ext/bc/C/rpc'
  const iport = port ? `${ip}:${port}` : `${ip}`
  const rpcurl = `${protocol}://${iport}`
  const web3 = new Web3(`${rpcurl}${path}`)

  // derive addresses from public key if provided (bech32 is later derived again)
  if (publicKey) {
    cAddressHex = publicKeyToEthereumAddressString(publicKey)
    cAddressHex = web3.utils.toChecksumAddress(cAddressHex) // add checksum
    addressBech32 = publicKeyToBech32AddressString(publicKey, config.hrp)
  }

  const pAddressBech32 = /*pAddressStrings[0] ||*/ `P-${addressBech32}`
  const cAddressBech32 = /*cAddressStrings[0] ||*/ `C-${addressBech32}`

  if (privkHex) {
    const prefixPrivkHex = privkHex.startsWith('0x') ? privkHex : `0x${privkHex}`
    const cAccount = web3.eth.accounts.privateKeyToAccount(prefixPrivkHex)
    const _cAddressHex = cAccount.address
    if (cAddressHex && cAddressHex.toLowerCase() !== _cAddressHex.toLowerCase()) {
      throw Error('C-chain address does not match private key')
    }
    cAddressHex = _cAddressHex
  }

  return {
    privkHex: privkHex,
    privkCB58: privkCB58,
    publicKey: publicKeyPair,
    rpcurl: rpcurl,
    web3: web3,
    pAddressBech32: pAddressBech32,
    cAddressBech32: cAddressBech32,
    cAddressHex: cAddressHex,
    config: config,
    chainID: chainID,
    network: network
  }
}

export function isDurango(network: string): boolean {
  const cfg = getNetworkConfig(network)
  if (!cfg) return false
  return Date.now() >= cfg.DurangoTime.getTime()
}