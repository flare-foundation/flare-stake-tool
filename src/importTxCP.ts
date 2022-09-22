import { pchain, pKeychain, pAddressBech32, cChainBlockchainID } from './constants'
import { BN, Buffer } from "avalanche/dist"
import { UTXOSet, UnsignedTx, Tx } from "avalanche/dist/apis/platformvm"
import { UnixNow } from "avalanche/dist//utils"

/**
 * Import funds exported from c-chain to p-chain to p-chain
 */
export async function importTxCP(): Promise<any> {
	const threshold: number = 1
	const locktime: BN = new BN(0)
	const memo: Buffer = Buffer.from(
		"PlatformVM utility method buildImportTx to import AVAX to the P-Chain from the C-Chain"
	)
	const asOf: BN = UnixNow()
	const platformVMUTXOResponse: any = await pchain.getUTXOs([pAddressBech32], cChainBlockchainID)
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
	console.log(`Success! TXID: ${txid}`)
}