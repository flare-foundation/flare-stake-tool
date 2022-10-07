import {
  cchain,
  pchain,
  cKeychain,
  cAddressHex,
  pAddressBech32,
  cAddressBech32,
  pChainBlockchainID,
  avaxAssetID,
  web3,
} from './constants'
import { integerToDecimal } from './utils'
import { BN } from '@flarenetwork/flarejs/dist'
import { UnsignedTx, Tx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/evm'
import { costImportTx, costExportTx } from "@flarenetwork/flarejs/dist/utils"

/**
 * Exports funds from C-chain to P-chain
 * @param amount - amount to export from C-chain to P-chain
 */
export async function exportTxCP(amount: BN, fee?: BN): Promise<any> {
  const threshold = 1
  const txcount = await web3.eth.getTransactionCount(cAddressHex)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  
  const importFee: BN = pchain.getDefaultTxFee()
  const baseFeeResponse: string = await cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)

  let unsignedTx: UnsignedTx = await cchain.buildExportTx(
    amount.add(importFee),
    avaxAssetID,
    pChainBlockchainID,
    cAddressHex,
    cAddressBech32,
    [pAddressBech32],
    nonce,
    locktime,
    threshold,
    baseFee
  )

  if (fee === undefined) {
    const exportCost: number = costExportTx(unsignedTx)
    fee = baseFee.mul(new BN(exportCost))
    unsignedTx = await cchain.buildExportTx(
      amount.add(importFee),
      avaxAssetID,
      pChainBlockchainID,
      cAddressHex,
      cAddressBech32,
      [pAddressBech32],
      nonce,
      locktime,
      threshold,
      fee
    )
    const feeRepr = integerToDecimal(fee.toString(), 9)
    console.log(`Using fee of ${feeRepr}`)
  }

  const tx: Tx = unsignedTx.sign(cKeychain)
  const txid = await cchain.issueTx(tx)
  const txstatus = await cchain.getAtomicTxStatus(txid)
  console.log(`TXID: ${txid}, Status ${txstatus}`)
}

/**
 * Import funds exported from P-chain to C-chain to C-chain.
 */
export async function importTxPC(fee?: BN) {
  const baseFeeResponse: string = await cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
  const evmUTXOResponse: any = await cchain.getUTXOs(
    [cAddressBech32],
    pChainBlockchainID
  )
  const utxoSet: UTXOSet = evmUTXOResponse.utxos
  let unsignedTx: UnsignedTx = await cchain.buildImportTx(
    utxoSet,
    cAddressHex,
    [cAddressBech32],
    pChainBlockchainID,
    [cAddressBech32],
    baseFee
  )

  if (fee === undefined) {
    const importCost: number = costImportTx(unsignedTx)
    fee = baseFee.mul(new BN(importCost))
    unsignedTx = await cchain.buildImportTx(
      utxoSet,
      cAddressHex,
      [cAddressBech32],
      pChainBlockchainID,
      [cAddressBech32],
      fee
    )
    const feeRepr = integerToDecimal(fee.toString(), 9)
    console.log(`Using fee of ${feeRepr}`)
  }

  const tx: Tx = unsignedTx.sign(cKeychain)
  const txid: string = await cchain.issueTx(tx)
  console.log(`Success! TXID: ${txid}`)
}