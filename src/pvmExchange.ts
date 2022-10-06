import {
  pchain,
  pKeychain,
  pAddressBech32,
  cAddressBech32,
  cChainBlockchainID,
} from './constants'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist//utils'

/**
 * Import funds exported from C-chain to P-chain to P-chain
 */
export async function importTxCP(): Promise<any> {
  const threshold = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    'PlatformVM utility method buildImportTx to import AVAX to the P-Chain from the C-Chain'
  )
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await pchain.getUTXOs(
    [pAddressBech32],
    cChainBlockchainID
  )
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos
  const unsignedTx: UnsignedTx = await pchain.buildImportTx(
    utxoSet,
    [pAddressBech32],
    cChainBlockchainID,
    [pAddressBech32],
    [pAddressBech32],
    [pAddressBech32],
    memo,
    asOf,
    locktime,
    threshold
  )
  const tx: Tx = unsignedTx.sign(pKeychain)
  const txid: string = await pchain.issueTx(tx)
  console.log(`success! TXID: ${txid}`)
}

/**
 * Export funds from P-chain to C-chain.
 * @param amount - amount to export
 * @param fee - fee used when exporting the transaction
 */
export async function exportTxPC(amount: BN, fee?: BN): Promise<any> {
  fee = (fee == undefined) ? pchain.getDefaultTxFee() : fee
  if (amount === undefined) { 
    const getBalanceResponse: any = await pchain.getBalance(pAddressBech32)
    amount = new BN(getBalanceResponse.unlocked)
  }
  const threshold: number = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    "PlatformVM utility method buildExportTx to export AVAX from the P-Chain to the C-Chain"
  )
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await pchain.getUTXOs([pAddressBech32])
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos
  const unsignedTx: UnsignedTx = await pchain.buildExportTx(
    utxoSet,
    amount.sub(fee),
    cChainBlockchainID,
    [cAddressBech32],
    [pAddressBech32],
    [pAddressBech32],
    memo,
    asOf,
    locktime,
    threshold
  )
  const tx: Tx = unsignedTx.sign(pKeychain)
  const txid: string = await pchain.issueTx(tx)
  console.log(`Success! TXID: ${txid}`)
}

