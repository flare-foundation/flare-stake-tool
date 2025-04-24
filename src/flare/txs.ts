import * as utils from '../utils'
import * as settings from '../settings'
import * as chain from './chain'
import * as contracts from './contracts'
import * as pubk from './pubk'
import {
  Account,
  ClaimCStakeRewardTxParams,
  DelegatorPTxDetails,
  DelegatorPTxParams,
  EcdsaSignature,
  ERC20TransferCTxParams,
  EvmTx,
  EvmTxDetails,
  EvmTxParams,
  ExportCTxDetails,
  ExportCTxParams,
  ExportPTxDetails,
  ExportPTxParams,
  ImportCTxDetails,
  ImportCTxParams,
  ImportPTxDetails,
  ImportPTxParams,
  PreSubmit,
  Sign,
  // TODO: needed?
  //StakePTxParams,
  SubmittedTxData,
  UnsignedTxData,
  UnwrapCTxParams,
  ValidatorPTxDetails,
  ValidatorPTxParams,
  WrapCTxParams
} from './interfaces'
import BN from 'bn.js'
import {
  evm,
  pvm,
  utils as futils,
  pvmSerial,
  UnsignedTx,
  EVMUnsignedTx,
  TransferableOutput,
  networkIDs,
  messageHashFromUnsignedTx,
  TypeSymbols,
  // TODO: signTx needed?
  // signTx,
  SigningData
} from '@flarenetwork/flarejs'
import {
  LegacyTransaction as EvmLegacyTx,
  FeeMarketEIP1559Transaction as EvmEIP1559Tx,
  TransactionFactory
} from '@ethereumjs/tx'
import Web3 from 'web3'
import { RLP } from '@ethereumjs/rlp'
import { Common } from '@ethereumjs/common'
import { getContext } from './context'

const TX_WAIT_MS = 15000
const TX_CHECK_MS = 1000

export async function buildExportCTx(
  account: Account,
  params: ExportCTxParams
): Promise<UnsignedTxData> {
  let importFeeReservation = await chain.getPTxDefaultFee(account.network)
  if (params.exportFee.isZero()) {
    params.exportFee = await _getExportCTxFee(account, params.amount, importFeeReservation)
  }
  let unsignedTx = await _getUnsignedExportCTx(
    account,
    params.amount,
    params.exportFee,
    importFeeReservation
  )
  let unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: {
      ...params,
      importFeeReservation,
      unsignedTxHex
    } as ExportCTxDetails,
    unsignedTx
  }
}

async function _getExportCTxFee(
  account: Account,
  amount: BN,
  importFeeReservation: BN
): Promise<BN> {
  const baseFee = await chain.getCTxBaseFee(account.network)
  const tx = await _getUnsignedExportCTx(account, amount, new BN(0), importFeeReservation)
  const cost = new BN(futils.costCorethTx(tx).toString())
  return baseFee.mul(cost)
}

async function _getUnsignedExportCTx(
  account: Account,
  amount: BN,
  exportFee: BN,
  importFeeReservation: BN
): Promise<EVMUnsignedTx> {
  const context = await getContext(account.network)
  const cAddress = futils.hexToBuffer(account.cAddress)
  const pAddress = futils.bech32ToBytes(account.pAddress)
  // console.log(' address ', account.publicKey)
  // console.log(' c address ', account.cAddress)
  // console.log(' p address ', account.pAddress)
  const nonce = await chain.numberOfCTxs(account.network, account.cAddress)

  return evm.newExportTx(
    context,
    BigInt(amount.add(importFeeReservation).toString()),
    context.pBlockchainID,
    cAddress,
    [pAddress],
    BigInt(exportFee.toString()),
    BigInt(nonce)
  )
}

export async function buildImportCTx(
  account: Account,
  params: ImportCTxParams
): Promise<UnsignedTxData> {
  if (params.importFee.isZero()) {
    params.importFee = await _getImportCTxFee(account)
  }
  let unsignedTx = await _getUnsignedImportCTx(account, params.importFee)
  let amount = await chain.getPCBalance(account.network, account.pAddress)
  let unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: { ...params, amount, unsignedTxHex } as ImportCTxDetails,
    unsignedTx
  }
}

async function _getImportCTxFee(account: Account): Promise<BN> {
  const baseFee = await chain.getCTxBaseFee(account.network)
  const tx = await _getUnsignedImportCTx(account, new BN(0))
  const cost = new BN(futils.costCorethTx(tx).toString())
  return baseFee.mul(cost)
}

async function _getUnsignedImportCTx(account: Account, importFee: BN): Promise<UnsignedTx> {
  const context = await getContext(account.network)
  const pAddressString = `C-${account.pAddress.slice(2)}`
  const pAddress = futils.bech32ToBytes(pAddressString)
  const cAddress = futils.hexToBuffer(account.cAddress)
  const evmapi = new evm.EVMApi(settings.URL[account.network])
  const { utxos } = await evmapi.getUTXOs({
    addresses: [pAddressString],
    sourceChain: 'P'
  })

  return evm.newImportTx(
    context,
    cAddress,
    [pAddress],
    utxos,
    context.pBlockchainID,
    BigInt(importFee.toString())
  )
}

export async function buildImportPTx(
  account: Account,
  params: ImportPTxParams
): Promise<UnsignedTxData> {
  const context = await getContext(account.network)
  const pvmapi = new pvm.PVMApi(settings.URL[account.network])
  const pAddressString = account.pAddress
  const pAddress = futils.bech32ToBytes(pAddressString)
  const { utxos } = await pvmapi.getUTXOs({
    addresses: [pAddressString],
    sourceChain: 'C'
  })

  const unsignedTx = pvm.newImportTx(
    context,
    context.cBlockchainID,
    utxos as any,
    [pAddress],
    [pAddress]
  )
  const amount = await chain.getCPBalance(account.network, account.pAddress)
  const importFee = await chain.getPTxDefaultFee(account.network)
  const unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: {
      ...params,
      amount,
      importFee,
      unsignedTxHex
    } as ImportPTxDetails,
    unsignedTx
  }
}

export async function buildExportPTx(
  account: Account,
  params: ExportPTxParams
): Promise<UnsignedTxData> {
  const context = await getContext(account.network)
  const pvmapi = new pvm.PVMApi(settings.URL[account.network])
  const pAddressString = account.pAddress
  const pAddress = futils.bech32ToBytes(pAddressString)

  const exportFee = await chain.getPTxDefaultFee(account.network)
  let amount = params.amount
  if (amount.isZero()) {
    amount = (await chain.getPBalance(account.network, account.pAddress)).sub(exportFee)
  }
  if (amount.lte(new BN(0))) {
    throw new Error('Export amount is smaller than or equal to zero')
  }

  const { utxos } = await pvmapi.getUTXOs({ addresses: [pAddressString] })
  const output = TransferableOutput.fromNative(context.avaxAssetID, BigInt(amount.toString()), [
    pAddress
  ])

  const unsignedTx = pvm.newExportTx(context, context.cBlockchainID, [pAddress], utxos as any, [
    output
  ])
  const unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: { ...params, exportFee, unsignedTxHex } as ExportPTxDetails,
    unsignedTx
  }
}

export async function buildAddDelegatorTx(
  account: Account,
  params: DelegatorPTxParams
): Promise<UnsignedTxData> {
  const context = await getContext(account.network)
  const pvmapi = new pvm.PVMApi(settings.URL[account.network])
  const pAddressString = account.pAddress
  const pAddress = futils.bech32ToBytes(pAddressString)
  const { utxos } = await pvmapi.getUTXOs({ addresses: [pAddressString] })

  const unsignedTx = pvm.newAddPermissionlessDelegatorTx(
    context,
    utxos as any,
    [pAddress],
    params.nodeId,
    networkIDs.PrimaryNetworkID.toString(),
    BigInt(params.startTime.toString()),
    BigInt(params.endTime.toString()),
    BigInt(params.amount.toString()),
    [pAddress]
  )
  const unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: { ...params, unsignedTxHex } as DelegatorPTxDetails,
    unsignedTx
  }
}

export async function buildAddValidatorTx(
  account: Account,
  params: ValidatorPTxParams
): Promise<UnsignedTxData> {
  const context = await getContext(account.network)
  const pvmapi = new pvm.PVMApi(settings.URL[account.network])
  const pAddressString = account.pAddress
  const pAddress = futils.bech32ToBytes(pAddressString)
  const { utxos } = await pvmapi.getUTXOs({ addresses: [pAddressString] })

  const unsignedTx = pvm.newAddPermissionlessValidatorTx(
    context,
    utxos as any,
    [pAddress],
    params.nodeId,
    networkIDs.PrimaryNetworkID.toString(),
    BigInt(params.startTime.toString()),
    BigInt(params.endTime.toString()),
    BigInt(params.amount.toString()),
    [pAddress],
    [pAddress],
    params.delegationFee,
    {
      changeAddresses: [pAddress]
    },
    1,
    0n,
    params.popBLSPublicKey,
    params.popBLSSignature
  )
  const unsignedTxHex = _unsignedTxToHex(unsignedTx)
  return {
    txDetails: { ...params, unsignedTxHex } as ValidatorPTxDetails,
    unsignedTx
  }
}

function _unsignedTxToHex(unsignedTx: UnsignedTx | EVMUnsignedTx): string {
  return utils.toHex(unsignedTx.toBytes())
}

export async function buildClaimCStakeRewardTx(
  account: Account,
  params: ClaimCStakeRewardTxParams
): Promise<UnsignedTxData> {
  let web3 = chain.getWeb3(account.network)
  let rewardManager = contracts.getValidatorRewardManager(account.network, web3)
  let data = (rewardManager.methods.claim as any)(
    account.cAddress,
    params.recipient,
    BigInt(utils.gweiToWei(params.amount).toString()),
    params.wrap
  ).encodeABI() as string
  return buildEvmTx(account, params, {
    to: rewardManager.options.address!,
    data
  })
}

export async function buildWrapCTx(
  account: Account,
  params: WrapCTxParams
): Promise<UnsignedTxData> {
  let web3 = chain.getWeb3(account.network)
  let wnat = contracts.getWNat(account.network, web3)
  let value = BigInt(utils.gweiToWei(params.amount).toString())
  let data = (wnat.methods.deposit as any)().encodeABI() as string
  return buildEvmTx(account, params, {
    to: wnat.options.address!,
    value,
    data
  })
}

export async function buildUnwrapCTx(
  account: Account,
  params: UnwrapCTxParams
): Promise<UnsignedTxData> {
  let web3 = chain.getWeb3(account.network)
  let wnat = contracts.getWNat(account.network, web3)
  let value = BigInt(utils.gweiToWei(params.amount).toString())
  let data = (wnat.methods.withdraw as any)(value).encodeABI() as string
  return buildEvmTx(account, params, { to: wnat.options.address!, data })
}

export async function buildERC20TransferCTx(
  account: Account,
  params: ERC20TransferCTxParams
): Promise<UnsignedTxData> {
  let web3 = chain.getWeb3(account.network)
  let erc20 = contracts.getERC20(params.token, web3)
  let value = BigInt(params.amount.toString())
  let data = (erc20.methods.transfer as any)(params.recipient, value).encodeABI() as string
  return buildEvmTx(account, params, { to: params.token, data })
}

export async function buildEvmTx(
  account: Account,
  params: EvmTxParams,
  evmTx: EvmTx
): Promise<UnsignedTxData> {
  let txData = {
    from: account.cAddress,
    chainId: BigInt(settings.CHAIN_ID[account.network]),
    ...evmTx
  }
  if (!txData.value) {
    txData.value = BigInt(0)
  }
  if (!txData.nonce) {
    txData.nonce = await chain.numberOfCTxs(account.network, account.cAddress)
  }
  if (!txData.maxFeePerGas) {
    let feeEstimate = await chain.estimateEIP1559Fee(account.network)
    txData.maxFeePerGas = feeEstimate[0]
    txData.maxPriorityFeePerGas = feeEstimate[1]
  }
  if (!txData.gasLimit) {
    let web3 = chain.getWeb3(account.network)
    let estimatedGasLimit = await web3.eth.estimateGas(txData)
    txData.gasLimit = (estimatedGasLimit * BigInt(10500)) / BigInt(10000)
  }

  let unsignedTx: EvmLegacyTx | EvmEIP1559Tx
  let unsignedTxHex
  if (params.txType == 0) {
    let common = Common.custom({ chainId: txData.chainId })
    let evmLegacyTx = {
      from: txData.from,
      to: Uint8Array.from(utils.toBuffer(txData.to)),
      data: Uint8Array.from(utils.toBuffer(txData.data ?? '')),
      value: txData.value,
      gasLimit: txData.gasLimit,
      gasPrice: txData.maxFeePerGas! - txData.maxPriorityFeePerGas!,
      nonce: txData.nonce,
      chainId: txData.chainId
    }
    unsignedTx = EvmLegacyTx.fromTxData(evmLegacyTx, { common })
    unsignedTxHex = utils.toHex(RLP.encode(unsignedTx.getMessageToSign()))
  } else if (params.txType == 2) {
    let evmEIP1559Tx = {
      from: txData.from,
      to: Uint8Array.from(utils.toBuffer(txData.to)),
      data: Uint8Array.from(utils.toBuffer(txData.data ?? '')),
      value: txData.value,
      gasLimit: txData.gasLimit,
      maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
      maxFeePerGas: txData.maxFeePerGas,
      nonce: txData.nonce,
      chainId: txData.chainId
    }
    unsignedTx = EvmEIP1559Tx.fromTxData(evmEIP1559Tx)
    unsignedTxHex = utils.toHex(unsignedTx.getMessageToSign())
  } else {
    throw new Error('Unsupported transaction type')
  }
  // let unsignedTxHex = utils.toHex(unsignedTx.serialize())

  return {
    txDetails: {
      ...params,
      ...txData,
      unsignedTxHex,
      isEvmTx: true
    } as EvmTxDetails,
    unsignedTx
  }
}

export async function finalizeAndConvertEvmTx(
  from: string,
  txHex: string,
  txType: number
): Promise<string> {
  let tx = TransactionFactory.fromSerializedData(utils.toBuffer(txHex))

  let chainId
  let accessList
  if (tx instanceof EvmLegacyTx) {
    chainId = tx.v!
    accessList = null
  } else if (tx instanceof EvmEIP1559Tx) {
    chainId = tx.chainId
    accessList = tx.accessList
  } else {
    throw new Error('Unsupported EVM transaction type given')
  }

  let network = _getNetworkFromChainId(chainId)

  let to = utils.toHex(tx.to ? tx.to!.toString() : '')
  let value = tx.value
  let data = utils.toHex(tx.data)
  let nonce = await chain.numberOfCTxs(network, from)
  let feeEstimate = await chain.estimateEIP1559Fee(network)
  let maxFeePerGas = feeEstimate[0]
  let maxPriorityFeePerGas = feeEstimate[1]
  let web3 = chain.getWeb3(network)
  let estimatedGasLimit = await web3.eth.estimateGas({
    from,
    to,
    value,
    data,
    nonce
  })
  let gasLimit = (estimatedGasLimit * BigInt(10500)) / BigInt(10000)

  let unsignedTxHex
  if (txType == 0) {
    let toArray = Uint8Array.from(utils.toBuffer(to))
    let dataArray = Uint8Array.from(utils.toBuffer(data))
    let common = Common.custom({ chainId })
    let gasPrice = maxFeePerGas - maxPriorityFeePerGas
    let unsignedTx = EvmLegacyTx.fromTxData(
      { to: toArray, value, data: dataArray, nonce, gasLimit, gasPrice },
      { common }
    )
    unsignedTxHex = utils.toHex(RLP.encode(unsignedTx.getMessageToSign()))
  } else if (txType == 2) {
    let toArray = Uint8Array.from(utils.toBuffer(to))
    let dataArray = Uint8Array.from(utils.toBuffer(data))
    let unsignedTx = EvmEIP1559Tx.fromTxData({
      chainId,
      to: toArray,
      value,
      data: dataArray,
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      accessList
    })
    unsignedTxHex = utils.toHex(unsignedTx.getMessageToSign())
  } else {
    throw new Error('Unsupported EVM transaction type requested')
  }

  return unsignedTxHex
}

export async function signAndSubmitTx(
  unsignedTxData: UnsignedTxData,
  sign: Sign,
  presubmit?: PreSubmit
): Promise<SubmittedTxData> {
  let unsignedTxHash
  let unsignedTx = unsignedTxData.unsignedTx
  if (unsignedTx instanceof EvmLegacyTx) {
    unsignedTxHash = utils.toHex(unsignedTx.getHashedMessageToSign())
  } else if (unsignedTx instanceof EvmEIP1559Tx) {
    unsignedTxHash = utils.toHex(unsignedTx.getHashedMessageToSign())
  } else if (unsignedTx instanceof UnsignedTx) {
    unsignedTxHash = utils.toHex(messageHashFromUnsignedTx(unsignedTx))
  } else {
    throw new Error(`Can not issue transaction of type ${typeof unsignedTx}`)
  }

  let signatureResponse = await sign({
    ...unsignedTxData.txDetails,
    unsignedTxHash
  })

  let id = ''
  let submitted = false
  let network = unsignedTxData.txDetails.network
  let signedTxData = { ...unsignedTxData, signature: '', signedTx: '' }
  if (signatureResponse.startsWith('id:')) {
    // the transaction was not just signed but also submitted to the network
    id = signatureResponse.slice(3)
    submitted = true
  } else {
    let signature = utils.toHex(signatureResponse, false)
    signedTxData.signature = signature

    let publicKey = pubk.recoverPublicKeyFromMsg(unsignedTxHash, signature)
    // console.log('1 ', publicKey)
    // console.log('2 ', unsignedTxData.txDetails.publicKey)
    if (!pubk.equalPublicKey(publicKey, unsignedTxData.txDetails.publicKey)) {
      if (unsignedTx instanceof UnsignedTx) {
        publicKey = pubk.recoverPublicKeyFromEthMsg(utils.toHex(unsignedTxHash, false), signature)
        if (!pubk.equalPublicKey(publicKey, unsignedTxData.txDetails.publicKey)) {
          throw new Error(
            'The public key recovered from the (ETH) signature does not match the expected public key'
          )
        }
      } else {
        throw new Error(
          'The public key recovered from the signature does not match the expected public key'
        )
      }
    }

    let signedTx: Uint8Array
    if (unsignedTx instanceof EvmLegacyTx || unsignedTx instanceof EvmEIP1559Tx) {
      let expandedSignature = _expandSignature(signature)
      let tx: EvmLegacyTx | EvmEIP1559Tx
      if (unsignedTx instanceof EvmLegacyTx) {
        let v = expandedSignature.recoveryParam
        if (v == 0 || v == 1) {
          v += 27
        }
        if (v == 27 || v == 28) {
          v += 8 + 2 * parseInt(settings.CHAIN_ID[network], 16)
        }
        tx = EvmLegacyTx.fromTxData({
          ...(unsignedTx.toJSON() as any),
          v: BigInt(v.toString()),
          r: BigInt(expandedSignature.r.toString()),
          s: BigInt(expandedSignature.s.toString())
        })
      } else {
        tx = EvmEIP1559Tx.fromTxData({
          ...(unsignedTx.toJSON() as any),
          v: BigInt(expandedSignature.recoveryParam.toString()),
          r: BigInt(expandedSignature.r.toString()),
          s: BigInt(expandedSignature.s.toString())
        })
      }
      signedTx = tx.serialize()
    } else if (unsignedTx instanceof EVMUnsignedTx) {
      const compressedPublicKey = pubk.compressPublicKey(Buffer.from('04' + publicKey, 'hex'))
      const expandedSignature = _expandSignature(signature)
      signTxDbg(unsignedTx, [
        {
          signature: _transformSignature(expandedSignature),
          publicKey: compressedPublicKey
        }
      ])
      signedTx = unsignedTx.getSignedTx().toBytes()
    } else {
      // unsignedTx instanceof UnsignedTx
      const compressedPublicKey = pubk.compressPublicKey(Buffer.from('04' + publicKey, 'hex'))
      const expandedSignature = _expandSignature(signature)
      signTxDbg(unsignedTx, [
        {
          signature: _transformSignature(expandedSignature),
          // signature: Buffer.from(signature, "hex"),
          publicKey: compressedPublicKey
        }
      ])
      signedTx = unsignedTx.getSignedTx().toBytes()
    }
    signedTxData.signedTx = utils.toHex(signedTx)

    let txSummary = {
      network: signedTxData.txDetails.network,
      type: signedTxData.txDetails.type,
      publicKey: signedTxData.txDetails.publicKey,
      unsignedTx: signedTxData.txDetails.unsignedTxHex,
      unsignedTxHash: signedTxData.txDetails.unsignedTxHash!,
      signature: signedTxData.signature,
      signedTx: signedTxData.signedTx
    }

    if (!presubmit || (await presubmit(txSummary))) {
      if (unsignedTx instanceof EvmLegacyTx || unsignedTx instanceof EvmEIP1559Tx) {
        let web3 = chain.getWeb3(network)
        id = await _submitEvmTx(web3, signedTxData.signedTx)
      } else {
        if (unsignedTx instanceof EVMUnsignedTx) {
          const evmapi = new evm.EVMApi(settings.URL[network])
          id = (
            await evmapi.issueTx({
              tx: utils.toHex(futils.addChecksum(signedTx))
            })
          ).txID
        } else if (unsignedTx instanceof UnsignedTx) {
          const pvmapi = new pvm.PVMApi(settings.URL[network])
          id = (
            await pvmapi.issueTx({
              tx: utils.toHex(futils.addChecksum(signedTx))
            })
          ).txID
        } else {
          throw new Error(`Can not issue transaction of type ${typeof unsignedTx}`)
        }
      }
      submitted = true
    }
  }

  let status = ''
  let confirmed = false
  if (submitted) {
    let result: any
    if (unsignedTx instanceof EvmLegacyTx || unsignedTx instanceof EvmEIP1559Tx) {
      result = await _waitForEvmTxConfirmation(chain.getWeb3(network), id)
    } else if (unsignedTx instanceof EVMUnsignedTx) {
      const evmapi = new evm.EVMApi(settings.URL[network])
      result = await _waitForCTxConfirmation(evmapi, id)
    } else if (unsignedTx instanceof UnsignedTx) {
      const pvmapi = new pvm.PVMApi(settings.URL[network])
      result = await _waitForPTxConfirmation(pvmapi, id)
    }
    status = result[0]
    confirmed = result[1]
  }

  return { ...signedTxData, id, status, submitted, confirmed }
}

function _expandSignature(signature: string): EcdsaSignature {
  let recoveryParam = parseInt(signature.slice(128, 130), 16)
  if (recoveryParam === 27 || recoveryParam === 28) {
    recoveryParam -= 27
  }
  return {
    r: new BN(signature.slice(0, 64), 'hex'),
    s: new BN(signature.slice(64, 128), 'hex'),
    recoveryParam: recoveryParam
  }
}

export async function submitTxHex(txHex: string): Promise<[string, string, boolean] | null> {
  try {
    // let ctx = new CTx()
    // ctx.fromBuffer(utils.toBuffer(txHex) as any)
    // let network = _getNetworkFromChainId(ctx.getUnsignedTx().getTransaction().getNetworkID())
    // const context = await getContext(network)
    // let avajs = chain.getAvalanche(network)

    // TODO: obtain network name from ...
    const evmapi = new evm.EVMApi(settings.URL['localflare'])
    let id = await _submitCTx(evmapi, txHex)
    let result = await _waitForCTxConfirmation(evmapi, id)
    let status = result[0]
    let confirmed = result[1]
    return [id, status, confirmed]
  } catch {}
  try {
    // let ptx = new PTx()
    // ptx.fromBuffer(utils.toBuffer(txHex) as any)
    // let network = _getNetworkFromChainId(ptx.getUnsignedTx().getTransaction().getNetworkID())
    // let avajs = chain.getAvalanche(network)

    const pvmapi = new pvm.PVMApi(settings.URL['localflare'])
    let id = await _submitPTx(pvmapi, txHex)
    let result = await _waitForPTxConfirmation(pvmapi, id)
    let status = result[0]
    let confirmed = result[1]
    return [id, status, confirmed]
  } catch {}
  try {
    let evmTx = TransactionFactory.fromSerializedData(utils.toBuffer(txHex))
    let chainId
    if (evmTx instanceof EvmLegacyTx) {
      chainId = evmTx.v!
    } else {
      chainId = evmTx.chainId
    }
    let network = _getNetworkFromChainId(chainId)
    let web3 = chain.getWeb3(network)
    let id = await _submitEvmTx(web3, txHex)
    let result = await _waitForEvmTxConfirmation(web3, id)
    let status = result[0]
    let confirmed = result[1]
    return [id, status, confirmed]
  } catch {}

  return null
}

async function _submitCTx(evmapi: evm.EVMApi, txHex: string): Promise<string> {
  const { txID } = await evmapi.issueTx({ tx: txHex })
  return txID
}

async function _submitPTx(pvmapi: pvm.PVMApi, txHex: string): Promise<string> {
  const { txID } = await pvmapi.issueTx({ tx: txHex })
  return txID
}

async function _submitEvmTx(web3: Web3, txHex: string): Promise<string> {
  let id = ''
  await web3.eth.sendSignedTransaction(txHex).on('transactionHash', (txHash) => {
    id = txHash
  })
  return id
}

async function _waitForCTxConfirmation(
  evmapi: evm.EVMApi,
  txId: string
): Promise<[string, boolean]> {
  let status = 'Unkown'
  let start = Date.now()
  while (Date.now() - start < TX_WAIT_MS) {
    status = (await evmapi.getAtomicTxStatus(txId)).status
    await utils.sleep(TX_CHECK_MS) // wait regardless of status for added safety
    if (status === 'Accepted' || status === 'Rejected') {
      break
    }
  }
  let confirmed = status === 'Accepted'
  return [status, confirmed]
}

async function _waitForPTxConfirmation(
  pvmapi: pvm.PVMApi,
  txId: string
): Promise<[string, boolean]> {
  let status = 'Unkown'
  let start = Date.now()
  while (Date.now() - start < TX_WAIT_MS) {
    status = (await pvmapi.getTxStatus({ txID: txId })).status
    await utils.sleep(TX_CHECK_MS) // wait regardless of status for added safety
    if (status === 'Committed' || status === 'Rejected') {
      break
    }
  }
  let confirmed = status === 'Committed'
  return [status, confirmed]
}

async function _waitForEvmTxConfirmation(web3: Web3, txId: string): Promise<[string, boolean]> {
  let status = 'Unkown'
  let start = Date.now()
  while (Date.now() - start < TX_WAIT_MS) {
    let receipt
    try {
      receipt = await web3.eth.getTransactionReceipt(txId)
    } catch {}
    if (receipt) {
      status = receipt.status == BigInt(1) ? 'Confirmed' : 'Failed'
      break
    }
    await utils.sleep(TX_CHECK_MS)
  }
  let confirmed = status === 'Confirmed'
  return [status, confirmed]
}

function _getNetworkFromChainId(chainId: number | bigint): string {
  let network = ''
  let chainIdHex = utils.toHex(chainId.toString(16))
  for (let entry of Object.entries(settings.CHAIN_ID)) {
    if (entry[1] === chainIdHex) {
      network = entry[0]
      break
    }
  }
  if (!network) {
    throw new Error('Unsupported network')
  }
  return network
}

export async function getStakeTransaction(
  network: string,
  txId: string
): Promise<
  | pvmSerial.AddDelegatorTx
  | pvmSerial.AddValidatorTx
  | pvmSerial.AddPermissionlessDelegatorTx
  | pvmSerial.AddPermissionlessValidatorTx
> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  let tx = await pvmapi.getTx({ txID: txId })
  switch (tx.unsignedTx._type) {
    case TypeSymbols.AddDelegatorTx:
      return tx.unsignedTx as pvmSerial.AddDelegatorTx
    case TypeSymbols.AddValidatorTx:
      return tx.unsignedTx as pvmSerial.AddValidatorTx
    case TypeSymbols.AddPermissionlessDelegatorTx:
      return tx.unsignedTx as pvmSerial.AddPermissionlessDelegatorTx
    case TypeSymbols.AddPermissionlessValidatorTx:
      return tx.unsignedTx as pvmSerial.AddPermissionlessValidatorTx
    default:
      throw new Error('Not a stake transaction')
  }
}

function _transformSignature(sig: EcdsaSignature) {
  const recovery = Buffer.alloc(1)
  recovery.writeUInt8(sig.recoveryParam, 0)
  const r = Buffer.from(sig.r.toArray('be', 32)) //we have to skip native Buffer class, so this is the way
  const s = Buffer.from(sig.s.toArray('be', 32)) //we have to skip native Buffer class, so this is the way
  return Buffer.concat([r, s, recovery], 65)
}

function signTxDbg(tx: UnsignedTx, signingData: SigningData[]): void {
  for (const data of signingData) {
    const coordinates = tx.getSigIndicesForPubKey(data.publicKey)
    if (coordinates) {
      coordinates.forEach(([index, subIndex]) => {
        tx.addSignatureAt(data.signature, index, subIndex)
      })
    }
  }
}
