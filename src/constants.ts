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

export let privkCB58 = process.env.PRIVATE_KEY_CB58!
export let privkHex = process.env.PRIVATE_KEY_HEX!

// derive private key in both b58 and hex if only one is provided
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
export const rpcurl = `${protocol}://${iport}`
export const web3 = new Web3(`${rpcurl}${path}`)

export const avalanche = new Avalanche(ip, port, protocol, networkID)
export const xchain: AVMAPI = avalanche.XChain()
export const cchain: EVMAPI = avalanche.CChain()
export const pchain: PlatformVMAPI = avalanche.PChain()
export const xKeychain: AVMKeyChain = xchain.keyChain()
export const cKeychain: EVMKeyChain = cchain.keyChain()
export const pKeychain: PVMKeyChain = pchain.keyChain()
if (privkCB58) {
  const privKey = `${PrivateKeyPrefix}${privkCB58}`
  xKeychain.importKey(privKey)
  cKeychain.importKey(privKey)
  pKeychain.importKey(privKey)
}

const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const cAddressStrings: string[] = cchain.keyChain().getAddressStrings()
const xAddressStrings: string[] = xchain.keyChain().getAddressStrings()
export const pAddressBech32 = pAddressStrings[0]
export const cAddressBech32 = cAddressStrings[0]
export const xAddressBech32 = xAddressStrings[0]

export let cAddressHex: string = ""
if (privkHex) {
  const cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
  cAddressHex = cAccount.address.toLowerCase()
}

export const pChainBlockchainID: string =
  Defaults.network[networkID].P.blockchainID
export const cChainBlockchainID: string =
  Defaults.network[networkID].C.blockchainID
export const avaxAssetID: string = Defaults.network[networkID].P.avaxAssetID!