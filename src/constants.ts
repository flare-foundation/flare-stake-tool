import { costwo, flare, localflare, NetworkConfig } from './config'
import { unPrefix0x, publicKeyToBech32AddressString, publicKeyToEthereumAddressString } from './utils'
import Web3 from 'web3'
import { BinTools, Buffer } from '@flarenetwork/flarejs'
import { Avalanche } from '@flarenetwork/flarejs'
import { PrivateKeyPrefix, Defaults } from '@flarenetwork/flarejs/dist/utils'
import { AVMAPI, KeyChain as AVMKeyChain } from '@flarenetwork/flarejs/dist/apis/avm'
import { EVMAPI, KeyChain as EVMKeyChain } from '@flarenetwork/flarejs/dist/apis/evm'
import { PlatformVMAPI, KeyChain as PVMKeyChain } from '@flarenetwork/flarejs/dist/apis/platformvm'


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
  xAddressBech32?: string,
  pAddressBech32?: string,
  cAddressBech32?: string,
  cAddressHex: string,
  xChainBlockchainID: string,
  cChainBlockchainID: string,
  pChainBlockchainID: string,
  avaxAssetID: string,
  config: NetworkConfig
}

export function contextEnv(path: string, network: string): Context {
  require('dotenv').config({path: path})
  const config = getConfig(network)
  const privkHex = process.env.PRIVATE_KEY_HEX
  const privkCB58 = process.env.PRIVATE_KEY_CB58
  const addressHex = process.env.ADDRESS_HEX
  const addressBech32 = process.env.ADDRESS_BECH32
  const publicKey = process.env.PUBLIC_KEY

  let _addressHex
  let _addressBech32
  if (publicKey) {
    _addressHex = publicKeyToEthereumAddressString(publicKey)
    _addressBech32 = publicKeyToBech32AddressString(publicKey, config.hrp)
  }
  if (addressHex && _addressHex && addressHex !== _addressHex) {
    throw Error('c-chain address does not match publicKey')
  }
  if (addressBech32 && _addressBech32 && addressBech32 !== _addressBech32) {
    throw Error('p-chain address does not match publicKey')
  }
  return context(config, privkHex, privkCB58, addressHex || _addressHex, addressBech32 || _addressBech32)
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
  privkHex?: string, privkCB58?: string,
  cAddressHex?: string, addressBech32?: string
): Context {
  const { protocol, ip, port, networkID, hrp } = config

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
  if (pAddressStrings.length > 0 && addressBech32 && addressBech32 !== pAddressStrings[0].substring(2)) {
    throw Error('p-chain address does not match private key')
  }
  const pAddressBech32 = pAddressStrings.length > 0 ? pAddressStrings[0] : `P-${addressBech32}`
  const cAddressBech32 = cAddressStrings.length > 0 ? cAddressStrings[0] : `C-${addressBech32}`
  const xAddressBech32 = xAddressStrings.length > 0 ? xAddressStrings[0] : `X-${addressBech32}`

  if (privkHex) {
    const cAccount = web3.eth.accounts.privateKeyToAccount(privkHex)
    const _cAddressHex = cAccount.address.toLowerCase()
    if (cAddressHex && cAddressHex !== _cAddressHex) {
      throw Error('c-chain address does not match private key')
    }
    cAddressHex = _cAddressHex
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
    cAddressHex: cAddressHex!,
    xChainBlockchainID: xChainBlockchainID,
    cChainBlockchainID: cChainBlockchainID,
    pChainBlockchainID: pChainBlockchainID,
    avaxAssetID: avaxAssetID,
    config: config
  }
}