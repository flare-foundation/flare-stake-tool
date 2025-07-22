import {
  Account,
  DelegatorPTxParams,
  ExportCTxParams,
  ExportPTxParams,
  ImportCTxParams,
  ImportPTxParams,
  PStake,
  TransferPTxParams,
  PreSubmit,
  Sign,
  SubmittedTxData,
  UnsignedTxData,
  ValidatorPTxParams} from './interfaces'
import * as chain from './chain'
import * as pubk from './pubk'
import * as txs from './txs'
import BN from 'bn.js'
import * as utils from '../utils'

const TX_EFFECT_TIMEOUT = 10000
const TX_EFFECT_DELAY = 500

export function _getAccount(network: string, publicKey: string): Account {
  return {
    network,
    publicKey: pubk.normalizePublicKey(publicKey),
    cAddress: pubk.publicKeyToCAddress(publicKey),
    pAddress: 'P-' + pubk.publicKeyToPAddress(network, publicKey)
  }
}
// transactions

export async function moveCP(
  exportParams: ExportCTxParams,
  importParams: ImportPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  if (
    exportParams.network !== importParams.network ||
    exportParams.publicKey !== importParams.publicKey
  ) {
    throw new Error('Inconsistent export and import parameters')
  }
  await exportCP(exportParams, sign, presubmit)
  return await importCP(importParams, sign, presubmit)
}

export async function exportCP(
  params: ExportCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let exportTx = await _exportCP(params, sign, presubmit)
  if (exportTx.submitted && !exportTx.confirmed) {
    throw new Error(
      `Export transaction ${exportTx.id} on C-chain not confirmed (status is ${exportTx.status})`
    )
  }
  return exportTx.id
}

export async function importCP(
  params: ImportPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let importTx = await _importCP(params, sign, presubmit)
  if (importTx.submitted && !importTx.confirmed) {
    throw new Error(
      `Import transaction ${importTx.id} on P-chain not confirmed (status is ${importTx.status})`
    )
  }
  return importTx.id
}

async function _exportCP(
  params: ExportCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildExportCTx(account, params)
  let balance = await chain.getCPBalance(account.network, account.pAddress)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted) {
    await _waitForBalanceChange(balance, () =>
      chain.getCPBalance(account.network, account.pAddress)
    )
  }
  return tx
}

async function _importCP(
  params: ImportPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildImportPTx(account, params)
  let balance = await chain.getPBalance(account.network, account.pAddress)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted) {
    await _waitForBalanceChange(balance, () => chain.getPBalance(account.network, account.pAddress))
  }
  return tx
}

export async function movePC(
  exportParams: ExportPTxParams,
  importParams: ImportCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  if (
    exportParams.network !== importParams.network ||
    exportParams.publicKey !== importParams.publicKey
  ) {
    throw new Error('Inconsistent export and import parameters')
  }
  await exportPC(exportParams, sign, presubmit)
  return await importPC(importParams, sign, presubmit)
}

export async function exportPC(
  params: ExportPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let exportTx = await _exportPC(params, sign, presubmit)
  if (exportTx.submitted && !exportTx.confirmed) {
    throw new Error(
      `Export transaction ${exportTx.id} on P-chain not confirmed (status is ${exportTx.status})`
    )
  }
  return exportTx.id
}

export async function importPC(
  params: ImportCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let importTx = await _importPC(params, sign, presubmit)
  if (importTx.submitted && !importTx.confirmed) {
    throw new Error(
      `Import transaction ${importTx.id} on C-chain not confirmed (status is ${importTx.status})`
    )
  }
  return importTx.id
}

async function _exportPC(
  params: ExportPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildExportPTx(account, params)
  let balance = await chain.getPCBalance(account.network, account.pAddress)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted) {
    await _waitForBalanceChange(balance, () =>
      chain.getPCBalance(account.network, account.pAddress)
    )
  }
  return tx
}

async function _importPC(
  params: ImportCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildImportCTx(account, params)
  let balance = await chain.getCBalance(account.network, account.cAddress)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted) {
    await _waitForBalanceChange(balance, () => chain.getCBalance(account.network, account.cAddress))
  }
  return tx
}

async function _waitForBalanceChange(startBalance: BN, balance: () => Promise<BN>): Promise<void> {
  await utils.waitWhile(
    async () => {
      return (await balance()).gt(startBalance)
    },
    TX_EFFECT_TIMEOUT,
    TX_EFFECT_DELAY
  )
}

export async function addDelegator(
  params: DelegatorPTxParams,
  sign: Sign,
  validate?: boolean,
  presubmit?: PreSubmit,
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  let stakes = await chain.getPStakes(account.network)
  if (validate) {
    await _checkNumberOfStakes(account, params.nodeId, params.startTime, params.endTime, stakes)
    await _checkNodeId(account, params.nodeId, stakes)
  }
  let unsignedTx = await txs.buildAddDelegatorTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(
      `Delegation transaction ${tx.id} on P-chain not confirmed (status is ${tx.status})`
    )
  }
  // TODO: possibly redundant (if address delegated to multiple nodes it can find the existing stake)
  // fix it ore remove it?
  if (tx.submitted) {
    await _waitForStake(account, tx.id)
  }
  return tx.id
}

export async function addValidator(
  params: ValidatorPTxParams,
  sign: Sign,
  validate?: boolean,
  presubmit?: PreSubmit
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  if (validate) {
    await _checkNumberOfStakes(account, params.nodeId, params.startTime, params.endTime)
  }
  let unsignedTx = await txs.buildAddValidatorTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(
      `Staking transaction ${tx.id} on P-chain not confirmed (status is ${tx.status})`
    )
  }
  if (tx.submitted) {
    await _waitForStake(account, tx.id)
  }
  return tx.id
}

export async function internalTransfer(
  params: TransferPTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  const account = _getAccount(params.network, params.publicKey)
  const unsignedTx = await txs.buildBaseTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(
      `Transfer transaction ${tx.id} on P-chain not confirmed (status is ${tx.status})`
    )
  }
  return tx.id
}

export async function _checkNumberOfStakes(
  account: Account,
  nodeId: string,
  startTime: BN,
  endTime: BN,
  stakes?: Array<PStake>
): Promise<void> {
  let allStakesOf = await chain.getPStakesOf(account.network, account.pAddress, stakes)
  let stakesOf = allStakesOf.filter(
    (s) =>
      new BN(s.endTime.getTime() / 1e3).gte(startTime) &&
      new BN(s.startTime.getTime() / 1e3).lte(endTime)
  )
  let nodeIds = Array.from(new Set(stakesOf.map((s) => s.nodeId.toLowerCase())))
  if (nodeIds.length >= 3 && !nodeIds.includes(nodeId.toLowerCase())) {
    throw new Error(
      `In the selected time period the account already has active stakes to ${nodeIds.length} different nodes`
    )
  }
}

export async function _checkNodeId(
  account: Account,
  nodeId: string,
  stakes?: Array<PStake>
): Promise<void> {
  if (!stakes) {
    stakes = await chain.getPStakes(account.network)
  }
  let nodeIds = stakes.filter((s) => s.type === 'validator').map((s) => s.nodeId)
  if (!nodeIds.includes(nodeId)) {
    throw new Error(`Unknown node id`)
  }
}

async function _waitForStake(account: Account, txId: string): Promise<void> {
  await utils.waitWhile(
    async () =>
      (await chain.getPStakesOf(account.network, account.pAddress)).some((x) => x.txId === txId),
    TX_EFFECT_TIMEOUT,
    TX_EFFECT_DELAY
  )
}

async function _signAndSubmitTx(
  unsignedTx: UnsignedTxData,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  return txs.signAndSubmitTx(unsignedTx, sign, presubmit)
}

export async function submitTxHex(txHex: string): Promise<string> {
  let result = await txs.submitTxHex(txHex)
  if (result == null) {
    throw new Error(`Transaction can not be decoded`)
  } else if (!result[2]) {
    throw new Error(`Transaction ${result[0]} not confirmed (status is ${result[1]})`)
  }
  return result[0]
}
