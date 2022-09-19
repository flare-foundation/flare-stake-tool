import { pchain, pKeychain, pAddressBech32 } from './constants'
import { BN, Buffer } from 'avalanche/dist'
import { UTXOSet, UnsignedTx, Tx } from 'avalanche/dist/apis/platformvm'
import { UnixNow } from 'avalanche/dist/utils'

/**
 * Stake by registring your node for validation
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param stakeDuration - the duration of the node's validation
 */
async function addValidator (nodeID: string, stakeAmount: BN, stakeDuration: BN): Promise<any> {
    const threshold = 1
    const locktime: BN = new BN(0)
    const memo: Buffer = Buffer.from(
        'PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet'
    )
    const asOf: BN = UnixNow()
    const startTime: BN = UnixNow().add(new BN(60 * 1))
    const endTime: BN = startTime.add(stakeDuration)
    const delegationFee = 10
    // const stakeAmount: any = (await pchain.getMinStake()).minValidatorStake
    const platformVMUTXOResponse: any = await pchain.getUTXOs(pAddressBech32)
    const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

    const unsignedTx: UnsignedTx = await pchain.buildAddValidatorTx(
        utxoSet,
        [pAddressBech32],
        [pAddressBech32],
        [pAddressBech32],
        nodeID,
        startTime,
        endTime,
        stakeAmount,
        [pAddressBech32],
        delegationFee,
        locktime,
        threshold,
        memo,
        asOf
    )

    const tx: Tx = unsignedTx.sign(pKeychain)
    const txid: string = await pchain.issueTx(tx)
    console.log(`Success! TXID: ${txid}`)
}

addValidator(process.argv[2], new BN(process.argv[3]), new BN(process.argv[4]))

/* 
import { sleepms } from './utils'

const nodesToAdd = [
    "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ",
    "NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN",
    "NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu",
    "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5"
]

async function main() {
    for (let i = 0; i < nodesToAdd.length; i++) {
        console.log(`adding ${i} ${nodesToAdd[i]}`)
        try {
            await addValidator(nodesToAdd[i], new BN("10000000000000"))
        } catch (e) {console.log(e)}
        await sleepms(3 * 1000)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
 */
