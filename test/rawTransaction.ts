import { contextEnv } from '../src/constants'
import { BN } from '@flarenetwork/flarejs/dist'
import { exportTxCP } from '../src/evmAtomicTx'
import { importTxCP } from '../src/pvmAtomicTx'
import { exportTxCPSignWithRawSignatures, exportTxCPUnsignedHashes } from './twoStepExportTxCP'

async function main() {
    const context = contextEnv('./.env', 'costwo')
    const tx = await exportTxCP(context, new BN(1e9))
    console.log(tx)
}

async function main2() {
    const context = contextEnv('./.env', 'costwo')
    const sigRequests = await exportTxCPUnsignedHashes(context, new BN(1e9), new BN(1e9))
    // sign the below output with fireblocks and save it into signature
    console.log("externally sign hashes:", sigRequests.requests)
    const signature = "e6d3cb6e678a56f43ee80d23d268ef5a1255d958af4ee37c859b2a75c9b397ae47b424db8231970b503b5db933976a6c055c8cd6ef9e3d1c4c398c8acf7bcc681c"
    const resp = await exportTxCPSignWithRawSignatures(context, [signature], sigRequests.transaction)
    console.log(resp)
}

main2()