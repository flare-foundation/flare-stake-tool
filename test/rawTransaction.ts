import { contextEnv } from '../src/constants'
import { BN } from '@flarenetwork/flarejs/dist'
import { exportTxCP } from '../src/evmAtomicTx'

async function main() {
    const context = contextEnv('./.env', 'costwo')
    const { cAddressHex, pAddressBech32 } = context
    const tx = await exportTxCP(context, new BN(1e9))
    console.log(tx)
}

main()