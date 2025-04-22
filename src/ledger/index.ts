import * as avalanche from './avalanche'
import * as ethereum from './ethereum'
import * as flare from './flare'
import * as pubk from '../flare/pubk'
import * as utils from '../utils'

const AVALANCHE = 'Avalanche'
const ETHEREUM = 'Ethereum'
const FLARE = 'Flare'

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.getPublicKey(bip44Path, hrp)
  } else if (app === AVALANCHE) {
    return await avalanche.getPublicKey(bip44Path, hrp)
  } else if (app === ETHEREUM) {
    return await ethereum.getPublicKey(bip44Path)
  } else {
    return ''
  }
}

export async function verifyCAddress(bip44Path: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.getCAddress(bip44Path, true)
  } else if (app === AVALANCHE) {
    return await avalanche.getCAddress(bip44Path, true)
  } else if (app === ETHEREUM) {
    return await ethereum.getCAddress(bip44Path, true)
  } else {
    return ''
  }
}

export async function verifyPAddress(bip44Path: string, hrp: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.getPAddress(bip44Path, hrp, true)
  } else if (app === AVALANCHE) {
    return await avalanche.getPAddress(bip44Path, hrp, true)
  } else if (app === ETHEREUM) {
    throw new Error('P-chain address can not be verified in Ethereum app.')
  } else {
    return ''
  }
}

export async function onlyHashSign(): Promise<boolean> {
  let app = await _getApp()
  return app === AVALANCHE || app === ETHEREUM
}

export async function sign(bip44Path: string, tx: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.sign(bip44Path, tx)
  } else if (app === AVALANCHE) {
    throw new Error('Nonblind signing of transactions is not supported on Avalanche app')
  } else if (app === ETHEREUM) {
    throw new Error('Nonblind signing of transactions is not supported on Ethereum app')
  } else {
    return ''
  }
}

export async function signEvmTransaction(bip44Path: string, tx: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.signEvmTransaction(bip44Path, tx)
  } else if (app === AVALANCHE) {
    return await avalanche.signEvmTransaction(bip44Path, tx)
  } else if (app === ETHEREUM) {
    return await ethereum.signEvmTransaction(bip44Path, tx)
  } else {
    return ''
  }
}

export async function signHash(bip44Path: string, message: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    return await flare.signHash(bip44Path, message)
  } else if (app === AVALANCHE) {
    return await avalanche.signHash(bip44Path, message)
  } else if (app === ETHEREUM) {
    return await ethereum.signPersonalMessage(bip44Path, utils.toHex(message, false))
  } else {
    return ''
  }
}

export async function signPersonalMessage(bip44Path: string, message: string): Promise<string> {
  let app = await _getApp()
  if (app === FLARE) {
    let hashedEthMsg = pubk.getHashedEthMsg(message)
    return await flare.signHash(bip44Path, hashedEthMsg)
  } else if (app === AVALANCHE) {
    let hashedEthMsg = pubk.getHashedEthMsg(message)
    return await avalanche.signHash(bip44Path, hashedEthMsg)
  } else if (app === ETHEREUM) {
    return await ethereum.signPersonalMessage(bip44Path, message)
  } else {
    return ''
  }
}

async function _getApp(): Promise<string> {
  //if (await flare.isFlareApp()) {
  return FLARE
  //} else if (await avalanche.isAvalancheApp()) {
  //  return AVALANCHE
  //} else if (await avalanche.isEthereumApp()) {
  //  return ETHEREUM
  //} else {
  //  throw new Error(
  //    'A supported app (Flare or Avalanche) is not running on the connected Ledger device'
  //  )
  //}
}
