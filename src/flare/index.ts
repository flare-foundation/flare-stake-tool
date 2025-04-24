import {
  Account,
  AccountState,
  ClaimCStakeRewardTxParams,
  DelegatorPTxParams,
  ERC20TransferCTxParams,
  ExportCTxParams,
  ExportPTxParams,
  ImportCTxParams,
  ImportPTxParams,
  PStake,
  PreSubmit,
  Sign,
  SubmittedTxData,
  UnsignedTxData,
  UnwrapCTxParams,
  ValidatorPTxParams,
  WrapCTxParams
} from './interfaces'
import * as chain from './chain'
import * as pubk from './pubk'
import * as txs from './txs'
import BN from 'bn.js'
import * as utils from '../utils'

const TX_EFFECT_TIMEOUT = 10000
const TX_EFFECT_DELAY = 500

// account

export async function getAccount(network: string, accountId: string): Promise<Account> {
  if (pubk.isPublicKey(accountId)) {
    return _getAccount(network, accountId)
  } else if (pubk.isCAddress(accountId)) {
    let publicKey = await pubk.cAddressToPublicKey(network, accountId)
    if (publicKey) {
      return _getAccount(network, publicKey)
    } else {
      throw new Error('Failed to determine stake account with the given C-chain address')
    }
  } else if (pubk.isPAddress(network, accountId)) {
    let publicKey = await pubk.pAddressToPublicKey(network, accountId)
    if (publicKey) {
      return _getAccount(network, publicKey)
    } else {
      throw new Error('Failed to determine stake account with the given P-chain address')
    }
  } else if (accountId.startsWith('NodeID-')) {
    let stakes = await chain.getPStakes(network)
    let stake = stakes.find((s) => s.nodeId === accountId && s.type === 'validator')
    let publicKey = undefined
    if (stake) {
      publicKey = await pubk.pAddressToPublicKey(network, stake.address)
    }
    if (publicKey) {
      return _getAccount(network, publicKey)
    } else {
      throw new Error('Failed to determine stake account with the given node id')
    }
  }
  throw new Error('Failed to determine stake account with the given identifier')
}

function _getAccount(network: string, publicKey: string): Account {
  return {
    network,
    publicKey: pubk.normalizePublicKey(publicKey),
    cAddress: pubk.publicKeyToCAddress(publicKey),
    pAddress: 'P-' + pubk.publicKeyToPAddress(network, publicKey)
  }
}

export async function getAccountState(network: string, publicKey: string): Promise<AccountState> {
  let account = _getAccount(network, publicKey)

  let time = new Date()
  let cBalance = await chain.getCBalance(network, account.cAddress)
  let pBalance = await chain.getPBalance(network, account.pAddress)
  let pcBalance = await chain.getPCBalance(network, account.pAddress)
  let cpBalance = await chain.getCPBalance(network, account.pAddress)
  let wcBalance = new BN(0) // await chain.getWCBalance(network, account.cAddress) TODO: solve this for localflare
  let cStake = new BN(0) // await chain.getCStake(network, account.cAddress) TODO: solve this for localflare
  let pStake = await chain.getPStake(network, account.pAddress)
  let pStakes = await chain.getPStakes(network)
  let pStakesOf = await chain.getPStakesOf(network, account.pAddress, pStakes)
  let pStakeUTXOsOf = await chain.getUTXOsFromPStakes(network, account.pAddress, pStakesOf)
  let pStakesTo = await chain.getPStakesTo(network, account.pAddress, pStakes)
  let cReward = new BN(0) // await chain.getUnclaimedCStakeReward(network, account.cAddress) TODO: solve this for localflare

  return {
    time,
    cBalance,
    pBalance,
    pcBalance,
    cpBalance,
    wcBalance,
    cStake,
    pStake,
    pStakesOf,
    pStakeUTXOsOf,
    pStakesTo,
    cReward
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
  // console.log('params pk', params.publicKey, params.network)
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
  presubmit?: PreSubmit,
  validate?: boolean
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
  if (tx.submitted) {
    await _waitForStake(account, tx.id)
  }
  return tx.id
}

export async function addValidator(
  params: ValidatorPTxParams,
  sign: Sign,
  presubmit?: PreSubmit,
  validate?: boolean
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

async function _checkNumberOfStakes(
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

async function _checkNodeId(
  account: Account,
  nodeId: string,
  stakes?: Array<PStake>
): Promise<void> {
  if (!stakes) {
    stakes = await chain.getPStakes(account.network)
  }
  let nodeIds = stakes.filter((s) => s.type === 'validator').map((s) => s.nodeId)
  if (!nodeIds.includes(nodeId)) {
    throw new Error(`Unkown node id`)
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

export async function claimCStakeReward(
  params: ClaimCStakeRewardTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildClaimCStakeRewardTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(
      `Claim reward transaction ${tx.id} on C-chain not confirmed (status is ${tx.status})`
    )
  }
  return tx.id
}

export async function wrapC(
  params: WrapCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildWrapCTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(`Wrap transaction ${tx.id} on C-chain not confirmed (status is ${tx.status})`)
  }
  return tx.id
}

export async function unwrapC(
  params: UnwrapCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildUnwrapCTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(`Unwrap transaction ${tx.id} on C-chain not confirmed (status is ${tx.status})`)
  }
  return tx.id
}

export async function erc20Transfer(
  params: ERC20TransferCTxParams,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<string> {
  let account = _getAccount(params.network, params.publicKey)
  let unsignedTx = await txs.buildERC20TransferCTx(account, params)
  let tx = await _signAndSubmitTx(unsignedTx, sign, presubmit)
  if (tx.submitted && !tx.confirmed) {
    throw new Error(
      `ERC-20 transfer transaction ${tx.id} on C-chain not confirmed (status is ${tx.status})`
    )
  }
  return tx.id
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
