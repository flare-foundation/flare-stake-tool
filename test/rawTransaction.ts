import { contextEnv } from '../src/constants'
import { BN } from '@flarenetwork/flarejs/dist'
import { exportTxCP, exportTxCP_unsignedHashes, exportTxCP_rawSignatures } from '../src/evmAtomicTx'
import { importTxCP, importTxCP_unsignedHashes, importTxCP_rawSignatures } from '../src/pvmAtomicTx'
import { addValidator_unsignedHashes, addValidator_rawSignatures } from '../src/addValidator'

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
    const sigRequests = await exportTxCP_unsignedHashes(context, new BN(1e9))
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.signData.requests)
    const signature = "06ad351d529713890f3522b7c8940354a8abbe5c842cb16385230ccf18d7ddbe13bfc486a8ce9ac584b3b953d1714bd75c93cfdfeed8cf1f4603df27942bbdea00"
    const resp = await exportTxCP_rawSignatures(context, [signature], sigRequests.signData.transaction)
    console.log(resp)
}

async function twoStepImport() {
    const context = contextEnv('./.env', 'localflare')
    const sigRequests = await importTxCP_unsignedHashes(context)
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    const signature = "183a7666474995f1ec04b858bbd0b3ab6dabde523202650379f1f8cf3b77418b76af06845bc2882591c8ae4447e127fb43b73d024222be1bf235f0b239c795001b"
    const resp = await importTxCP_rawSignatures(context, [signature, signature], sigRequests.transaction)
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

twoStepExport()