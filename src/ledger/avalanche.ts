import AvalancheApp, { ResponseAddress, ResponseSign } from '@avalabs/hw-app-avalanche'
import { ledgerService } from '@ledgerhq/hw-app-eth'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import * as pubk from '../flare/pubk'
import * as utils from '../utils'
import { EthAddress, Signature } from './interfaces'

export async function isAvalancheApp(): Promise<boolean> {
  return (await _getAppName()) === 'Avalanche'
}

export async function isEthereumApp(): Promise<boolean> {
  return (await _getAppName()) === 'Ethereum'
}

async function _getAppName(): Promise<string> {
  let appName = ''
  await _connect(async (app) => {
    let info = await app.getAppInfo()
    appName = info.appName
  })
  return appName
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  let account: ResponseAddress | undefined
  await _connect(async (app) => {
    account = await app.getAddressAndPubKey(bip44Path, false, hrp)
  })
  if (!account || !account.publicKey) {
    throw new Error('Invalid or missing public key from ledger response');
  }

  let publicKey = pubk.normalizePublicKey(utils.toHex(account.publicKey))
  return publicKey
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  let account: EthAddress | undefined
  await _connect(async (app) => {
    account = await app.getETHAddress(bip44Path, display)
  })
  if (!account) {
    throw Error(
      `Failed to obtain C-chain address from ledger`
    )
  }
  return account.address
}

export async function getPAddress(
  bip44Path: string,
  hrp: string,
  display: boolean
): Promise<string> {
  let account: ResponseAddress | undefined
  await _connect(async (app) => {
    account = await app.getAddressAndPubKey(bip44Path, display, hrp)
  })
  if (!account) {
    throw Error(
      `Failed to obtain public key from ledger`
    )
  }
  return account.address
}

export async function signHash(bip44Path: string, message: string): Promise<string> {
  let signPath = _getSignPath(bip44Path)
  let messageBuffer = utils.toBuffer(message)
  let response: ResponseSign | undefined
  await _connect(async (app) => {
    response = await app.signHash(_getAccountPath(bip44Path), [signPath], messageBuffer)
  })
  if (!response) {
    if (response && (response as ResponseSign).errorMessage != "No errors") {
      throw new Error(`Failed to sign message on ledger:  ${(response as ResponseSign).errorMessage}`)
    }
    throw new Error( `Failed to sign message on ledger`)
  }
  let signature = response.signatures?.get(signPath)?.toString('hex')
  if (!signature) {
    throw new Error('No signature returned from ledger')
  }
  return signature
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  let rawTx = utils.toHex(txHex, false)
  let resolution = await ledgerService.resolveTransaction(rawTx, {}, {})
  let response: Signature | undefined
  await _connect(async (app) => {
    response = await app.signEVMTransaction(bip44Path, rawTx, resolution)
  })
  if (!response) {
    throw new Error('Failed to sign EVM transaction on ledger')
  }
  if (!response.r || !response.s || !response.v) {
    throw new Error('Failed to get signature from ledger device')
  }
  let r = Buffer.from(utils.toHex(response.r, false), 'hex')
  let s = Buffer.from(utils.toHex(response.s, false), 'hex')
  let recoveryParam = parseInt(utils.toHex(response.v, false), 16)
  if (recoveryParam == 0 || recoveryParam == 1) {
    recoveryParam += 27
  } else if (recoveryParam > 28) {
    recoveryParam = recoveryParam % 2 == 1 ? 27 : 28
  }
  let v = Buffer.from(recoveryParam.toString(16), 'hex')
  let signature = utils.toHex(Buffer.concat([r, s, v]), false)
  return signature
}

async function _connect(execute: (app: AvalancheApp) => Promise<void>): Promise<void> {
  let avalanche: AvalancheApp | undefined = undefined
  try {
    let transport = await TransportNodeHid.open(undefined)
    avalanche = new AvalancheApp(transport)
    await execute(avalanche)
  } finally {
    if (avalanche && avalanche.transport) {
      await avalanche.transport.close()
    }
  }
}

function _getAccountPath(bip44Path: string): string {
  return bip44Path.substring(0, bip44Path.length - 4)
}

function _getSignPath(bip44Path: string): string {
  return bip44Path.substring(bip44Path.length - 3)
}