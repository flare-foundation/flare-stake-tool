import { Context } from './constants'
import { SignData } from './interfaces'
import { integerToDecimal, expandSignature, serializeExportCP_args, deserializeExportCP_args } from './utils'
import { BN } from '@flarenetwork/flarejs/dist'
import { EcdsaSignature } from '@flarenetwork/flarejs/dist/common'
import { UnsignedTx, Tx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/evm'
import { costImportTx, costExportTx } from "@flarenetwork/flarejs/dist/utils"

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
  const usedFee = integerToDecimal(fee.toString(), 9)
  return { txid: txid, usedFee: usedFee }
}

/**
 * Import funds exported from P-chain to C-chain to C-chain.
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
  const usedFee = integerToDecimal(fee.toString(), 9)
  return { txid: txid, usedFee: usedFee }
}

/**
 * Get hashes that need to get signed in order for funds to be
 * exported from P-chain to C-chain to C-chain.
 * @param ctx - context with constants initialized from user keys
 * @param amount - amount to export from C-chain to P-chain
 * @param fee - export transaction fee
 */
export async function exportTxCP_unsignedHashes(
  ctx: Context, amount: BN, fee?: BN
): Promise<{ signData: SignData, usedFee: string }> {
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

  return {
    usedFee: args[9]!.toString(),
    signData: <SignData>{
      requests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
      transaction: serializeExportCP_args(args)
    }
  }
}

/**
 * Export funds from C-chain to P-chain by providing signed hashes
 * @param ctx - context with constants initialized from user keys
 * @param signatures - signatures of the relevant hashes
 * @param transaction - serialized export C - P transaction
 */
export async function exportTxCP_rawSignatures(
  ctx: Context, signatures: string[], transaction: string
): Promise<{ txid: string }> {
  const ecdsaSignatures: EcdsaSignature[] = signatures.map(
    (signature: string) => expandSignature(signature))
  const unsignedTx = await ctx.cchain.buildExportTx(...deserializeExportCP_args(transaction))
  const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
  const txid = await ctx.cchain.issueTx(tx)
  return { txid: txid }
}