const { protocol, ip, port, networkID } = require('../config.ts')
import { unPrefix0x } from './utils'
const Web3 = require('web3')
import { BinTools, Buffer } from 'avalanche'
import { Avalanche } from 'avalanche'
import { AVMAPI, KeyChain as AVMKeyChain } from 'avalanche/dist/apis/avm'
import { EVMAPI, KeyChain as EVMKeyChain } from 'avalanche/dist/apis/evm'
import { PlatformVMAPI, KeyChain as PVMKeyChain } from 'avalanche/dist/apis/platformvm'
import { PrivateKeyPrefix, Defaults } from 'avalanche/dist/utils'

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
} else throw Error('Private key has to be provided in either hex or cb58')

const path = '/ext/bc/C/rpc'
export const web3 = new Web3(`${protocol}://${ip}:${port}${path}`)
const cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
export const cAddressHex: string = cAccount.address.toLowerCase()

export const avalanche = new Avalanche(ip, port, protocol, networkID)
export const xchain: AVMAPI = avalanche.XChain()
export const cchain: EVMAPI = avalanche.CChain()
export const pchain: PlatformVMAPI = avalanche.PChain()
const privKey = `${PrivateKeyPrefix}${privkCB58}`
export const xKeychain: AVMKeyChain = xchain.keyChain()
export const cKeychain: EVMKeyChain = cchain.keyChain()
export const pKeychain: PVMKeyChain = pchain.keyChain()
xKeychain.importKey(privKey)
cKeychain.importKey(privKey)
pKeychain.importKey(privKey)

const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const cAddressStrings: string[] = cchain.keyChain().getAddressStrings()
export const pChainBlockchainID: string = Defaults.network[networkID].P.blockchainID
export const cChainBlockchainID: string = Defaults.network[networkID].C.blockchainID
export const avaxAssetID: string = Defaults.network[networkID].P.avaxAssetID!

export const pAddressBech32 = pAddressStrings[0]
export const cAddressBech32 = cAddressStrings[0]