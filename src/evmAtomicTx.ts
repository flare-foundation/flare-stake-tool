import { Context } from './constants'
import { integerToDecimal } from './utils'
import { BN } from '@flarenetwork/flarejs/dist'
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
  const baseFeeResponse: string = await ctx.cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)

  let unsignedTx: UnsignedTx = await ctx.cchain.buildExportTx(
    amount.add(importFee),
    ctx.avaxAssetID,
    ctx.pChainBlockchainID,
    ctx.cAddressHex,
    ctx.cAddressBech32,
    [ctx.pAddressBech32],
    nonce,
    locktime,
    threshold,
    baseFee
  )
  
  if (fee === undefined) {
    const exportCost: number = costExportTx(unsignedTx)
    fee = baseFee.mul(new BN(exportCost))
    unsignedTx = await ctx.cchain.buildExportTx(
      amount.add(importFee),
      ctx.avaxAssetID,
      ctx.pChainBlockchainID,
      ctx.cAddressHex,
      ctx.cAddressBech32,
      [ctx.pAddressBech32],
      nonce,
      locktime,
      threshold,
      fee
    )
  }

  const tx: Tx = unsignedTx.sign(ctx.cKeychain)
  const txid = await ctx.cchain.issueTx(tx)
  // const txstatus = await cchain.getAtomicTxStatus(txid)
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
    [ctx.cAddressBech32],
    ctx.pChainBlockchainID
  )
  const utxoSet: UTXOSet = evmUTXOResponse.utxos
  let unsignedTx: UnsignedTx = await ctx.cchain.buildImportTx(
    utxoSet,
    ctx.cAddressHex,
    [ctx.cAddressBech32],
    ctx.pChainBlockchainID,
    [ctx.cAddressBech32],
    baseFee
  )

  if (fee === undefined) {
    const importCost: number = costImportTx(unsignedTx)
    fee = baseFee.mul(new BN(importCost))
    unsignedTx = await ctx.cchain.buildImportTx(
      utxoSet,
      ctx.cAddressHex,
      [ctx.cAddressBech32],
      ctx.pChainBlockchainID,
      [ctx.cAddressBech32],
      fee
    )
  }

  const tx: Tx = unsignedTx.sign(ctx.cKeychain)
  const txid: string = await ctx.cchain.issueTx(tx)
  const usedFee = integerToDecimal(fee.toString(), 9)
  return { txid: txid, usedFee: usedFee }
}