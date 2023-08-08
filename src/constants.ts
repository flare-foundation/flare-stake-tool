import Web3 from 'web3'
import fs from 'fs'
import { Avalanche, BinTools, Buffer as FlrBuffer } from '@flarenetwork/flarejs'
import { PrivateKeyPrefix, PublicKeyPrefix, Defaults } from '@flarenetwork/flarejs/dist/utils'
import { EVMAPI, KeyChain as EVMKeyChain } from '@flarenetwork/flarejs/dist/apis/evm'
import { PlatformVMAPI as PVMAPI, KeyChain as PVMKeyChain } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { Context, ContextFile } from './interfaces'
import { costwo, flare, localflare, NetworkConfig } from './config'
import {
  unPrefix0x, publicKeyToBech32AddressString, publicKeyToEthereumAddressString,
  privateKeyToPublicKey,
  decodePublicKey
} from './utils'

function readContextFile(ctxFile: string): ContextFile {
  const file = fs.readFileSync(ctxFile, 'utf8')
  return JSON.parse(file) as ContextFile
}

export function contextEnv(path: string, network: string): Context {
  require('dotenv').config({path: path})
  return getContext(
    network,
    process.env.PUBLIC_KEY,
    process.env.PRIVATE_KEY_HEX,
    process.env.PRIVATE_KEY_CB58)
}

export function contextFile(ctxFile: string): Context {
  const ctx = readContextFile(ctxFile)
  return getContext(ctx.network, ctx.publicKey)
}

export function networkFromContextFile(ctxFile: string): string {
  const ctx = readContextFile(ctxFile)
  return ctx.network
}

export function getContext(network: string, publicKey?: string, privateKeyHex?: string, privateKeyCB58?: string): Context {
  return context(getConfig(network), publicKey, privateKeyHex, privateKeyCB58)
}

function getConfig(network: string): NetworkConfig {
  let networkConfig
  if (network == 'flare' || network === undefined) {
    networkConfig = flare
  } else if (network == 'costwo') {
    networkConfig = costwo
  } else if (network == 'localflare') {
    networkConfig = localflare
  } else throw Error('Invalid network')
  return networkConfig
}

function context(
  config: NetworkConfig,
  publicKey?: string, privkHex?: string, privkCB58?: string,
): Context {
  const { protocol, ip, port, networkID, hrp } = config

  // those two addresses should be derived for most cli applications
  let cAddressHex: string | undefined
  let addressBech32: string | undefined

  // derive private key in both cb58 and hex if only one is provided
  const bintools = BinTools.getInstance()
  if (privkHex !== undefined && privkHex !== '') {
    privkHex = unPrefix0x(privkHex)
    const privkBuf = bintools.addChecksum(FlrBuffer.from(privkHex, 'hex'))
    privkCB58 = bintools.bufferToB58(privkBuf)
  } else if (privkCB58 !== undefined && privkCB58 !== '') {
    const privkBuf = bintools.cb58Decode(privkCB58)
    privkHex = privkBuf.toString('hex')
  }

  // derive the public key coords if private key is present and check that they match
  // the public key if provided
  let publicKeyPair: [Buffer, Buffer] | undefined
  if (publicKey) {
    publicKeyPair = decodePublicKey(publicKey)
    publicKey = "04" + Buffer.concat(publicKeyPair).toString('hex') // standardize
  }
  if (privkHex) {
    const [pubX, pubY] = privateKeyToPublicKey(Buffer.from(privkHex, 'hex'))
    if (publicKey && (!publicKeyPair![0].equals(pubX) || !publicKeyPair![0].equals(pubY))) {
      throw Error("provided private key does not match the public key")
    }
    publicKeyPair = [pubX, pubY]
  }

  // derive addresses from public key if provided (bech32 is later derived again)
  if (publicKey) {
    cAddressHex = publicKeyToEthereumAddressString(publicKey)
    addressBech32 = publicKeyToBech32AddressString(publicKey, config.hrp)
  }

  const path = '/ext/bc/C/rpc'
  const iport = port ? `${ip}:${port}` : `${ip}`
  const rpcurl = `${protocol}://${iport}`
  const web3 = new Web3(`${rpcurl}${path}`)

  const avalanche = new Avalanche(ip, port, protocol, networkID)
  const cchain: EVMAPI = avalanche.CChain()
  const pchain: PVMAPI = avalanche.PChain()
  const cKeychain: EVMKeyChain = cchain.keyChain()
  const pKeychain: PVMKeyChain = pchain.keyChain()

  if (privkCB58 || publicKey) {
    const key = (privkCB58) ? `${PrivateKeyPrefix}${privkCB58}` : `${PublicKeyPrefix}${publicKey!}`
    pKeychain.importKey(key)
    cKeychain.importKey(key)
  }

  const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
  const cAddressStrings: string[] = cchain.keyChain().getAddressStrings()
  const pAddressBech32 = pAddressStrings[0] || `P-${addressBech32}`
  const cAddressBech32 = cAddressStrings[0] || `C-${addressBech32}`

  if (privkHex) {
    const cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
    const _cAddressHex = cAccount.address.toLowerCase()
    if (cAddressHex && cAddressHex !== _cAddressHex) {
      throw Error('c-chain address does not match private key')
    }
    cAddressHex = _cAddressHex
  }

  const pChainBlockchainID: string =
    Defaults.network[networkID].P.blockchainID
  const cChainBlockchainID: string =
    Defaults.network[networkID].C.blockchainID
  const avaxAssetID: string = Defaults.network[networkID].P.avaxAssetID!

  return {
    privkHex: privkHex,
    privkCB58: privkCB58,
    publicKey: publicKeyPair,
    rpcurl: rpcurl,
    web3: web3,
    avalanche: avalanche,
    cchain: cchain,
    pchain: pchain,
    cKeychain: cKeychain,
    pKeychain: pKeychain,
    pAddressBech32: pAddressBech32,
    cAddressBech32: cAddressBech32,
    cAddressHex: cAddressHex,
    cChainBlockchainID: cChainBlockchainID,
    pChainBlockchainID: pChainBlockchainID,
    avaxAssetID: avaxAssetID,
    config: config
  }
}