import fs from 'fs'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import AvalancheApp from '@avalabs/hw-app-avalanche'
import { sha256 } from 'ethereumjs-util'
import { recoverTransactionPublicKey, recoverTransactionSigner, prefix0x, standardizePublicKey, expandDerivationPath } from './utils'


// If blind is true, then the message is a hash of the transaction buffer,
// otherwise the message is the transaction buffer itself.
async function ledgerSign(message: string, derivationPath: string, blind: boolean = true): Promise<{
	signature: string, address: string, publicKey: string
}> {
	const messageBuffer = Buffer.from(message, 'hex')
	const transport = await TransportNodeHid.open(undefined)
	const avalanche = new AvalancheApp(transport)

	const { accountPath, signPath } = expandDerivationPath(derivationPath)
	let pubk: Buffer
	let addr: string
	let signature: string
	if (blind) {
		const resp = await avalanche.signHash(accountPath, [signPath], messageBuffer)
		const sign = resp.signatures?.get(signPath)?.toString('hex')
		if (!sign) {
			throw new Error("No signature returned")
		}
		signature = sign
		pubk = recoverTransactionPublicKey(messageBuffer, prefix0x(signature))
		addr = recoverTransactionSigner(messageBuffer, prefix0x(signature))
	} else {
		const resp = await avalanche.sign(accountPath, [signPath], messageBuffer)
		const sign = resp.signatures?.get(signPath)?.toString('hex')
		if (!sign) {
			throw new Error("No signature returned")
		}
		signature = sign
		pubk = recoverTransactionPublicKey(sha256(messageBuffer), prefix0x(signature))
		addr = recoverTransactionSigner(sha256(messageBuffer), prefix0x(signature))
	}
    return {
		signature: signature,
		address: addr,
		publicKey: standardizePublicKey(pubk.toString('hex'))
	}
}

export async function sign(file: string, derivationPath: string, blind: boolean = true) {
    const json = fs.readFileSync(file, 'utf8')
    const tx: any = JSON.parse(json)
    if (tx && tx.signatureRequests && tx.signatureRequests.length > 0) {
		const message = blind ? tx.signatureRequests[0].message : tx.unsignedTransactionBuffer
        const { signature } = await ledgerSign(message, derivationPath, blind)
        tx.signature = signature
        let outFile = file.replace('unsignedTx.json', 'signedTx.json')
        if (outFile === file) {
            outFile = file + '.signed'
        }
        fs.writeFileSync(outFile, JSON.stringify(tx, null, 2))
    } else {
        console.log("Invalid transaction file")
    }
}
