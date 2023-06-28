import { BN } from '@flarenetwork/flarejs/dist'
import { EcdsaSignature } from '@flarenetwork/flarejs/dist/common'
import { UnsignedTx, Tx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/evm'
import { costImportTx, costExportTx } from "@flarenetwork/flarejs/dist/utils"
import { SignedTxJson, UnsignedTxJson, Context } from './interfaces'
import {
  integerToDecimal as shiftDecimals, expandSignature,
  serializeExportCP_args, deserializeExportCP_args, deserializeImportPC_args,
  serializeImportPC_args
} from './utils'


/**
 * Exports funds from C-chain to P-chain
 * @param ctx - context with constants initialized from user keys
 * @param amount - amount to export from C-chain to P-chain
 * @param fee - export transaction fee
 */
export async function exportTxCP(
  ctx: Context, amount: BN, fee?: BN
): Promise<{ txid: string, usedFee: string }> {
  const threshold = 1
  const txcount = await ctx.web3.eth.getTransactionCount(ctx.cAddressHex)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  const importFee: BN = ctx.pchain.getDefaultTxFee()

  let unsignedTx: UnsignedTx = await ctx.cchain.buildExportTx(
    amount.add(importFee),
    ctx.avaxAssetID,
    ctx.pChainBlockchainID,
    ctx.cAddressHex!,
    ctx.cAddressBech32!,
    [ctx.pAddressBech32!],
    nonce,
    locktime,
    threshold,
    fee
  )

  if (fee === undefined) {
    const baseFeeResponse: string = await ctx.cchain.getBaseFee()
    const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
    const exportCost: number = costExportTx(unsignedTx)
    fee = baseFee.mul(new BN(exportCost))
    unsignedTx = await ctx.cchain.buildExportTx(
      amount.add(importFee),
      ctx.avaxAssetID,
      ctx.pChainBlockchainID,
      ctx.cAddressHex!,
      ctx.cAddressBech32!,
      [ctx.pAddressBech32!],
      nonce,
      locktime,
      threshold,
      fee
    )
  }

  const tx: Tx = unsignedTx.sign(ctx.cKeychain)
  const txid = await ctx.cchain.issueTx(tx)
  const usedFee = shiftDecimals(fee.toString(), 9)
  return { txid: txid, usedFee: usedFee }
}

/**
 * Generate unsigned import transaction from P-chain to C-chain.
 * @param ctx - context with constants initialized from user keys
 * @param fee - import transaction fee
 */
export async function getUnsignedImportTxPC(
  ctx: Context, fee?: BN
): Promise<UnsignedTxJson> {
  const baseFeeResponse: string = await ctx.cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
  const evmUTXOResponse: any = await ctx.cchain.getUTXOs(
    [ctx.cAddressBech32!],
    ctx.pChainBlockchainID
  )
  const utxoSet: UTXOSet = evmUTXOResponse.utxos

  const args: [UTXOSet, string, string[], string, string[], BN] = [
    utxoSet,
    ctx.cAddressHex!,
    [ctx.cAddressBech32!],
    ctx.pChainBlockchainID,
    [ctx.cAddressBech32!],
    baseFee
  ]

  let unsignedTx: UnsignedTx = await ctx.cchain.buildImportTx(...args)

  if (fee === undefined) {
    const importCost: number = costImportTx(unsignedTx)
    fee = baseFee.mul(new BN(importCost))
    args[5] = fee
    unsignedTx = await ctx.cchain.buildImportTx(...args)
  }

  return <UnsignedTxJson>{
    serialization: serializeImportPC_args(args),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex'),
    usedFee: fee.toString(10)
  }
}

/**
 * Import funds exported from P-chain to C-chain.
 * @param ctx - context with constants initialized from user keys
 * @param fee - import transaction fee
 */
export async function importTxPC(
  ctx: Context, fee?: BN
): Promise<{ txid: string, usedFee: string }> {
  const baseFeeResponse: string = await ctx.cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
  const evmUTXOResponse: any = await ctx.cchain.getUTXOs(
    [ctx.cAddressBech32!],
    ctx.pChainBlockchainID
  )
  const utxoSet: UTXOSet = evmUTXOResponse.utxos
  let unsignedTx: UnsignedTx = await ctx.cchain.buildImportTx(
    utxoSet,
    ctx.cAddressHex!,
    [ctx.cAddressBech32!],
    ctx.pChainBlockchainID,
    [ctx.cAddressBech32!],
    baseFee
  )

  if (fee === undefined) {
    const importCost: number = costImportTx(unsignedTx)
    fee = baseFee.mul(new BN(importCost))
    unsignedTx = await ctx.cchain.buildImportTx(
      utxoSet,
      ctx.cAddressHex!,
      [ctx.cAddressBech32!],
      ctx.pChainBlockchainID,
      [ctx.cAddressBech32!],
      fee
    )
  }

  const tx: Tx = unsignedTx.sign(ctx.cKeychain)
  const txid: string = await ctx.cchain.issueTx(tx)
  const usedFee = shiftDecimals(fee.toString(), 9)
  return { txid: txid, usedFee: usedFee }
}

/**
 * Get hashes that need to get signed in order for funds to be
 * exported from P-chain to C-chain to C-chain.
 * @param ctx - context with constants initialized from user keys
 * @param amount - amount to export from C-chain to P-chain
 * @param fee - export transaction fee
 */
export async function getUnsignedExportTxCP(ctx: Context, amount: BN, fee?: BN): Promise<UnsignedTxJson> {
  const threshold = 1
  const txcount = await ctx.web3.eth.getTransactionCount(ctx.cAddressHex)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  const importFee: BN = ctx.pchain.getDefaultTxFee()

  const args: [BN, string, string, string, string, string[], number, BN, number, BN?] = [
    amount.add(importFee),
    ctx.avaxAssetID,
    ctx.pChainBlockchainID,
    ctx.cAddressHex!,
    ctx.cAddressBech32!,
    [ctx.pAddressBech32!],
    nonce,
    locktime,
    threshold,
    fee
  ]

  let unsignedTx = await ctx.cchain.buildExportTx(...args)
  if (fee === undefined) {
    const baseFeeResponse: string = await ctx.cchain.getBaseFee()
    const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
    const exportCost: number = costExportTx(unsignedTx)
    args[9] = baseFee.mul(new BN(exportCost))
    unsignedTx = await ctx.cchain.buildExportTx(...args)
  }

  return <UnsignedTxJson>{
    serialization: serializeExportCP_args(args),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex'),
    usedFee: args[9]!.toString(10)
  }
}

/**
 * Issue a transaction to export funds from C-chain to P-chain
 * @param ctx - context with constants initialized from user keys
 * @param signedTxJson - signed transaction
 */
export async function issueSignedEvmTxCPExport(ctx: Context, signedTxJson: SignedTxJson): Promise<{ chainTxId: string }> {
  return issueSignedEvmTx(ctx, signedTxJson, async (serialization: string) =>
    ctx.cchain.buildExportTx(...deserializeExportCP_args(serialization)))
}

/**
 * Issue a transaction to import funds from P-chain
 * @param ctx - context with constants initialized from user keys
 * @param signedTxJson - signed transaction
 */
export async function issueSignedEvmTxPCImport(ctx: Context, signedTxJson: SignedTxJson): Promise<{ chainTxId: string }> {
  return issueSignedEvmTx(ctx, signedTxJson, async (serialization: string) =>
    ctx.cchain.buildImportTx(...deserializeImportPC_args(serialization)))
}

async function issueSignedEvmTx(ctx: Context, signedTxJson: SignedTxJson,
    txBuilder: (serialization: string) => Promise<UnsignedTx>): Promise<{ chainTxId: string }> {
  const signatures = Array(signedTxJson.signatureRequests.length).fill(signedTxJson.signature)
  const ecdsaSignatures: EcdsaSignature[] = signatures.map((signature: string) => expandSignature(signature))
  const unsignedTx = await txBuilder(signedTxJson.serialization)
  const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
  const chainTxId = await ctx.cchain.issueTx(tx)
  return { chainTxId: chainTxId }
}
