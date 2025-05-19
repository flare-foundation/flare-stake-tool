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
  const exportTx = evm.newExportTxFromBaseFee(
    context,
    baseFee / BigInt(FLR),
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
  const baseFee = await evmapi.getBaseFee()
  const { utxos } = await evmapi.getUTXOs({
    sourceChain: 'P',
    addresses: [ctx.cAddressBech32!]
  })

  const tx = evm.newImportTxFromBaseFee(
    context,
    futils.hexToBuffer(ctx.cAddressHex!),
    [futils.bech32ToBytes(ctx.pAddressBech32!)],
    utxos,
    getChainIdFromContext('P', context),
    baseFee / BigInt(FLR)
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

export async function internalTransfer(ctx: Context, params: FlareTxParams) {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32!] })
  const pChainAddressBytes = futils.bech32ToBytes(ctx.pAddressBech32!)
  const tx = pvm.newBaseTx(context, [pChainAddressBytes], utxos, [
    TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount!), [
      pChainAddressBytes,
    ]),
  ]);

  await addTxSignatures({
    unsignedTx: tx,
    privateKeys: [futils.hexToBuffer(ctx.privkHex!)]
  })

  return { txid: (await pvmapi.issueSignedTx(tx.getSignedTx())).txID }
}
