const { protocol, ip, port, networkID, privateKey } = require("../config.ts");
import { Avalanche, BinTools, BN, Buffer } from "avalanche"
import { PlatformVMAPI, KeyChain, UTXOSet, UnsignedTx, Tx } from "avalanche/dist/apis/platformvm"
import { UnixNow } from "avalanche/dist/utils"
import { PrivateKeyPrefix } from "avalanche/dist/utils"

const MINUTE = 60
const duration = process.argv[2]
const amount = process.argv[3]

const avalanche = new Avalanche(ip, port, protocol, networkID)
const pchain: PlatformVMAPI = avalanche.PChain()
const bintools: BinTools = BinTools.getInstance()
const pKeychain: KeyChain = pchain.keyChain()
const privKey: string = `${PrivateKeyPrefix}${privateKey}`
pKeychain.importKey(privKey)
const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const threshold: number = 1
const locktime: BN = new BN(0)
const memo: Buffer = bintools.stringToBuffer("PlatformVM utility method buildAddDelegatorTx to add a delegator to the primary subnet")
const asOf: BN = UnixNow()
const nodeID: string = "NodeID-DueWyGi3B9jtKfa9mPoecd4YSDJ1ftF69"
const startTime: BN = UnixNow().add(new BN(MINUTE))
const endTime: BN = startTime.add(new BN(duration))

const main = async (): Promise<any> => {
    const stakeAmount = await pchain.getMinStake() // 1 AVAX
    const platformVMUTXOResponse = await pchain.getUTXOs(pAddressStrings)
    const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

    const unsignedTx: UnsignedTx = await pchain.buildAddDelegatorTx(
        utxoSet,
        pAddressStrings,
        pAddressStrings,
        pAddressStrings,
        nodeID,
        startTime,
        endTime,
        (amount === undefined) ? stakeAmount.minDelegatorStake : new BN(amount),
        pAddressStrings,
        locktime,
        threshold,
        memo,
        asOf
    )
    const tx: Tx = unsignedTx.sign(pKeychain)
    const id: string = await pchain.issueTx(tx)

    console.log(id)
}

main()