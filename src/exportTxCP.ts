import { cchain, cKeychain, cAddressHex, pAddressBech32, cAddressBech32, pChainBlockchainID, avaxAssetID, web3 } from './constants'
import { BN } from "avalanche/dist"
import { UnsignedTx, Tx } from 'avalanche/dist/apis/evm'

/**
 * Exports funds from c-chain to p-chain
 * @param avaxAmount - amount to export from c-chain to p-chain
 */
async function exportTxCP(avaxAmount: BN): Promise<any> {
  const threshold = 1
  const baseFeeResponse: string = await cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16))
  const txcount = await web3.eth.getTransactionCount(cAddressHex)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  const fee: BN = baseFee.div(new BN(1e9)).add(new BN(1e7))

  let unsignedTx: UnsignedTx = await cchain.buildExportTx(
    avaxAmount,
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

  const tx: Tx = unsignedTx.sign(cKeychain)
  const txid = await cchain.issueTx(tx)
  const txstatus = await cchain.getAtomicTxStatus(txid)

  let balance: BN = new BN(await web3.eth.getBalance(cAddressHex))
  balance = new BN(balance.toString().slice(0,-18))

  console.log(`TXID: ${txid}, Status ${txstatus}`)
  console.log(`exported ${avaxAmount} from ${cAddressHex} to ${pAddressBech32}`)
  console.log(`balance: ${balance}`)
}

exportTxCP(new BN(process.argv[2]))
