import { JsonRpcProvider } from 'ethers'
import * as settings from './settings'
import {
  pvm,
  evm,
  utils as futils,
  addTxSignatures,
  TransferableOutput,
  Context as FContext,
  networkIDs
} from '@flarenetwork/flarejs'
import { Context, FlareTxParams } from './interfaces'
import * as chain from './flare/chain'
import { _checkNodeId, _checkNumberOfStakes, _getAccount } from './flare'
import { BN } from 'bn.js'

const FLR = 1e9 // one FLR in nanoFLR

function getChainIdFromContext(sourceChain: 'X' | 'P' | 'C', context: FContext.Context) {
  return sourceChain === 'C'
    ? context.cBlockchainID
    : sourceChain === 'P'
      ? context.pBlockchainID
      : context.xBlockchainID
}

export async function exportCP(ctx: Context, params: FlareTxParams) {
  const provider = new JsonRpcProvider(settings.URL[ctx.config.hrp] + '/ext/bc/C/rpc')
  const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  if (!ctx.cAddressHex) {
    throw new Error('cAddressHex is undefined or null');
  }
  const txCount = await provider.getTransactionCount(ctx.cAddressHex)
  const baseFee = await evmapi.getBaseFee()
  const fee = !params.fee || BigInt(params.fee) == 0n  || BigInt(params.fee) < baseFee? baseFee : BigInt(params.fee)
  const exportTx = evm.newExportTxFromBaseFee(
    context,
    fee / BigInt(FLR),
    BigInt(params.amount!),
    context.pBlockchainID,
    futils.hexToBuffer(ctx.cAddressHex),
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    BigInt(txCount)
  )

  await addTxSignatures({
    unsignedTx: exportTx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await evmapi.issueSignedTx(exportTx.getSignedTx())).txID }
}
export async function importCP(ctx: Context, params: FlareTxParams) {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])

  const { utxos } = await pvmapi.getUTXOs({
    sourceChain: 'C',
    addresses: [ctx.pAddressBech32!]
  })

  const importTx = pvm.newImportTx(
    context,
    getChainIdFromContext('C', context),
    utxos,
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    [futils.bech32ToBytes(ctx.cAddressBech32!)]
  )

  await addTxSignatures({
    unsignedTx: importTx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await pvmapi.issueSignedTx(importTx.getSignedTx())).txID }
}

export async function exportPC(ctx: Context, params: FlareTxParams) {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const { utxos } = await pvmapi.getUTXOs({
    addresses: [ctx.pAddressBech32!]
  })

  const exportTx = pvm.newExportTx(
    context,
    getChainIdFromContext('C', context),
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    utxos,
    [
      TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount!), [
        futils.bech32ToBytes(ctx.pAddressBech32!)
      ])
    ]
  )
  await addTxSignatures({
    unsignedTx: exportTx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })
  return { txid: (await pvmapi.issueSignedTx(exportTx.getSignedTx())).txID }
}
export async function importPC(ctx: Context, params: FlareTxParams) {
  const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const { utxos } = await evmapi.getUTXOs({
    sourceChain: 'P',
    addresses: [ctx.cAddressBech32!]
  })
  const baseFee = await evmapi.getBaseFee()
  const fee = !params.fee || BigInt(params.fee) == 0n  || BigInt(params.fee) < baseFee? baseFee : BigInt(params.fee)
  const tx = evm.newImportTxFromBaseFee(
    context,
    futils.hexToBuffer(ctx.cAddressHex!),
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    utxos,
    getChainIdFromContext('P', context),
    fee / BigInt(FLR)
  )

  await addTxSignatures({
    unsignedTx: tx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await evmapi.issueSignedTx(tx.getSignedTx())).txID }
}

export async function addValidator(ctx: Context, params: FlareTxParams) {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32!] })
  const start = BigInt(params.startTime!)
  const end = BigInt(params.endTime!)
  const nodeID = params.nodeId!
  const blsPublicKey = futils.hexToBuffer(params.popBlsPublicKey!)
  const blsSignature = futils.hexToBuffer(params.popBlsSignature!)

  const pk = Buffer.concat(ctx.publicKey!).toString('hex')
  const account = _getAccount(ctx.network!, pk)
  let stakes = await chain.getPStakes(account.network)
  await _checkNumberOfStakes(account, params.nodeId!, new BN(params.startTime!), new BN(params.endTime!), stakes)

  const tx = pvm.newAddPermissionlessValidatorTx(
    context,
    utxos,
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    nodeID,
    networkIDs.PrimaryNetworkID.toString(),
    start,
    end,
    BigInt(params.amount!),
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    Number(params.delegationFee) * 1e4, // default fee is 10%
    undefined,
    1,
    0n,
    blsPublicKey,
    blsSignature
  )

  await addTxSignatures({
    unsignedTx: tx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await pvmapi.issueSignedTx(tx.getSignedTx())).txID }
}
export async function addDelegator(ctx: Context, params: FlareTxParams) {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32!] })
  const start = BigInt(params.startTime!)
  const end = BigInt(params.endTime!)
  const nodeID = params?.nodeId as string

  const pk = Buffer.concat(ctx.publicKey!).toString('hex')
  const account = _getAccount(ctx.network!, pk)
  let stakes = await chain.getPStakes(account.network)
  await _checkNumberOfStakes(account, params.nodeId!, new BN(params.startTime!), new BN(params.endTime!), stakes)
  await _checkNodeId(account, params.nodeId!, stakes)

  const tx = pvm.newAddPermissionlessDelegatorTx(
    context,
    utxos,
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    nodeID,
    networkIDs.PrimaryNetworkID.toString(),
    start,
    end,
    BigInt(params.amount!),
    [futils.bech32ToBytes(ctx.pAddressBech32!)]
  )

  await addTxSignatures({
    unsignedTx: tx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await pvmapi.issueSignedTx(tx.getSignedTx())).txID }
}
