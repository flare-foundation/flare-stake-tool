import { contextEnv } from '../src/constants'
import { BN } from '@flarenetwork/flarejs/dist'
import { exportTxCP, exportTxCP_unsignedHashes, exportTxCP_rawSignatures } from '../src/evmAtomicTx'
import { importTxCP, importTxCP_unsignedHashes, importTxCP_rawSignatures } from '../src/pvmAtomicTx'
import { addValidator_unsignedHashes, addValidator_rawSignatures } from '../src/addValidator'
import { sendToForDefi } from './forDefi'
import { addDelegator_rawSignatures, addDelegator_unsignedHashes } from '../src/addDelegator'


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
    const sigRequests = await exportTxCP_unsignedHashes(context, new BN(0.5 * 1e9))
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.signData.requests)
    console.log(sigRequests.signData.requests[0].message)
    // const signature = "07358d7de5fc6e9828a9be5ef7972fad4a9bba0fea71798a9197e6bab73ccd1e36fa7f11e5523ee3d3f540cfe95b17eaf26aa830fc51786cd85fad9699f6471600"
    const signature = await sendToForDefi(sigRequests.signData.requests[0].message)
    const resp = await exportTxCP_rawSignatures(context, [signature], sigRequests.signData.transaction)
    console.log(resp)
}

async function twoStepImport() {
    const context = contextEnv('./.env', 'costwo')
    const sigRequests = await importTxCP_unsignedHashes(context)
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    // const signature = "183a7666474995f1ec04b858bbd0b3ab6dabde523202650379f1f8cf3b77418b76af06845bc2882591c8ae4447e127fb43b73d024222be1bf235f0b239c795001b"
    const signature = await sendToForDefi(sigRequests.requests[0].message)
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

async function twoStepAddDelegator() {
    const context = contextEnv('./.env', 'costwo')
    let pbalance = (new BN((await context.pchain.getBalance(context.pAddressBech32!)).balance)).toString()
    console.log(pbalance)
    const sigRequests = await addDelegator_unsignedHashes(
        context, "NodeID-2mCUTA33bHU4vb8NQHE8QewftqC8p1fv8", new BN(1000 * 1e9), new BN(1688014670), new BN(1690606670)
    )
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    const signature = await sendToForDefi(sigRequests.requests[0].message)
    const resp = await addDelegator_rawSignatures(context, [signature], sigRequests.transaction)
    console.log(resp)
}

twoStepExport()
// twoStepImport()