export const { protocol, ip, port, networkID, hrp } = require('./config')
import { unPrefix0x } from './utils'
const Web3 = require('web3')
import { BinTools, Buffer } from '@flarenetwork/flarejs'
import { Avalanche } from '@flarenetwork/flarejs'
import { AVMAPI, KeyChain as AVMKeyChain } from '@flarenetwork/flarejs/dist/apis/avm'
import { EVMAPI, KeyChain as EVMKeyChain } from '@flarenetwork/flarejs/dist/apis/evm'
import {
  PlatformVMAPI,
  KeyChain as PVMKeyChain,
} from '@flarenetwork/flarejs/dist/apis/platformvm'
import { PrivateKeyPrefix, Defaults } from '@flarenetwork/flarejs/dist/utils'

export interface Context {
  privkHex?: string,
  privkCB58?: string,
  rpcurl: string,
  web3: any,
  avalanche: Avalanche,
  xchain: AVMAPI,
  cchain: EVMAPI,
  pchain: PlatformVMAPI,
  xKeychain: AVMKeyChain,
  cKeychain: EVMKeyChain,
  pKeychain: PVMKeyChain,
  xAddressBech32: string,
  pAddressBech32: string,
  cAddressBech32: string,
  cAddressHex: string,
  xChainBlockchainID: string,
  cChainBlockchainID: string,
  pChainBlockchainID: string,
  avaxAssetID: string
}

export function context(privkHex?: string, privkCB58?: string): Context {

  // derive private key in both cb58 and hex if only one is provided
  const bintools = BinTools.getInstance()
  if (privkHex !== undefined && privkHex !== '') {
    privkHex = unPrefix0x(privkHex)
    const privkBuf = bintools.addChecksum(Buffer.from(privkHex, 'hex'))
    privkCB58 = bintools.bufferToB58(privkBuf)
  } else if (privkCB58 !== undefined && privkCB58 !== '') {
    const privkBuf = bintools.cb58Decode(privkCB58)
    privkHex = privkBuf.toString('hex')
  }

  const path = '/ext/bc/C/rpc'
  const iport = port ? `${ip}:${port}` : `${ip}`
  const rpcurl = `${protocol}://${iport}`
  const web3 = new Web3(`${rpcurl}${path}`)

  const avalanche = new Avalanche(ip, port, protocol, networkID)
  const xchain: AVMAPI = avalanche.XChain()
  const cchain: EVMAPI = avalanche.CChain()
  const pchain: PlatformVMAPI = avalanche.PChain()
  const xKeychain: AVMKeyChain = xchain.keyChain()
  const cKeychain: EVMKeyChain = cchain.keyChain()
  const pKeychain: PVMKeyChain = pchain.keyChain()
  if (privkCB58) {
    const privKey = `${PrivateKeyPrefix}${privkCB58}`
    xKeychain.importKey(privKey)
    cKeychain.importKey(privKey)
    pKeychain.importKey(privKey)
  }

  const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
  const cAddressStrings: string[] = cchain.keyChain().getAddressStrings()
  const xAddressStrings: string[] = xchain.keyChain().getAddressStrings()
  const pAddressBech32 = pAddressStrings[0]
  const cAddressBech32 = cAddressStrings[0]
  const xAddressBech32 = xAddressStrings[0]

  let cAddressHex: string = ""
  if (privkHex) {
    const cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
    cAddressHex = cAccount.address.toLowerCase()
  }

  const xChainBlockchainID: string =
    Defaults.network[networkID].X.blockchainID 
  const pChainBlockchainID: string =
    Defaults.network[networkID].P.blockchainID
  const cChainBlockchainID: string =
    Defaults.network[networkID].C.blockchainID
  const avaxAssetID: string = Defaults.network[networkID].P.avaxAssetID!

  return {
    privkHex: privkHex,
    privkCB58: privkCB58,
    rpcurl: rpcurl,
    web3: web3,
    avalanche: avalanche,
    xchain: xchain,
    cchain: cchain,
    pchain: pchain,
    xKeychain: xKeychain,
    cKeychain: cKeychain,
    pKeychain: pKeychain,
    xAddressBech32: xAddressBech32,
    pAddressBech32: pAddressBech32,
    cAddressBech32: cAddressBech32,
    cAddressHex: cAddressHex,
    xChainBlockchainID: xChainBlockchainID,
    cChainBlockchainID: cChainBlockchainID,
    pChainBlockchainID: pChainBlockchainID,
    avaxAssetID: avaxAssetID
  }
}

export function contextEnv(path: string): Context {
  require('dotenv').config(path)
  const privkHex = process.env.PRIVATE_KEY_HEX!
  const privkCB58 = process.env.PRIVATE_KEY_CB58!
  return context(privkHex, privkCB58)
}

