import { contextEnv } from '../src/constants'
import { BN } from '@flarenetwork/flarejs/dist'
import { exportTxCP } from '../src/evmAtomicTx'
import { importTxCP } from '../src/pvmAtomicTx'
import { exportTxCPSignWithRawSignatures, exportTxCPUnsignedHashes } from './twoStepExportTxCP'
import { importTxCP_unsignedHashes, importTxCPSign_rawSignatures } from './twoStepImportTxCP'
import { addValidator_unsignedHashes, addValidator_rawSignatures } from './twoStepValidator'

async function main() {
    const context = contextEnv('./.env', 'costwo')
    const tx = await exportTxCP(context, new BN(1e9))
    console.log(tx)
}

async function main0() {
    const context = contextEnv('./.env', 'costwo')
    const tx = await importTxCP(context)
    console.log(tx)
}

async function twoStepExport() {
    const context = contextEnv('./.env', 'costwo')
    const sigRequests = await exportTxCPUnsignedHashes(context, new BN(1e9), new BN(1e9))
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    const signature = "e6d3cb6e678a56f43ee80d23d268ef5a1255d958af4ee37c859b2a75c9b397ae47b424db8231970b503b5db933976a6c055c8cd6ef9e3d1c4c398c8acf7bcc681c"
    const resp = await exportTxCPSignWithRawSignatures(context, [signature], sigRequests.transaction)
    console.log(resp)
}

async function twoStepImport() {
    const context = contextEnv('./.env', 'localflare')
    const sigRequests = await importTxCP_unsignedHashes(context)
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    const signature = "183a7666474995f1ec04b858bbd0b3ab6dabde523202650379f1f8cf3b77418b76af06845bc2882591c8ae4447e127fb43b73d024222be1bf235f0b239c795001b"
    const resp = await importTxCPSign_rawSignatures(context, [signature, signature], sigRequests.transaction)
    console.log(resp)
}

async function twoStepAddValidator() {
    const context = contextEnv('./.env', 'localflare')
    let pbalance = (new BN((await context.pchain.getBalance(context.pAddressBech32!)).balance)).toString()
    console.log(pbalance)
    const sigRequests = await addValidator_unsignedHashes(
        context, "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5", new BN("200000000000000"), new BN(1688014670), new BN(1690606670)
    )
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
}

twoStepAddValidator()