const { protocol, ip, port, networkID, privateKey } = require('../config.ts')
import { Avalanche, BN, Buffer } from "avalanche/dist"
import {
  PlatformVMAPI,
  KeyChain,
  UTXOSet,
  UnsignedTx,
  Tx
} from "avalanche/dist/apis/platformvm"
import { PrivateKeyPrefix, UnixNow } from "avalanche/dist/utils"

const avalanche: Avalanche = new Avalanche(ip, port, protocol, networkID)
const pchain: PlatformVMAPI = avalanche.PChain()
const pKeychain: KeyChain = pchain.keyChain()
const privKey: string = `${PrivateKeyPrefix}${privateKey}`
pKeychain.importKey(privKey)
const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const threshold: number = 1
const locktime: BN = new BN(0)
const memo: Buffer = Buffer.from(
  "PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet"
)
const asOf: BN = UnixNow()
const nodeID: string = "NodeID-4XZ7a7fGCzw6xqMFNQHy46JjUXnnq51Y1"
const startTime: BN = UnixNow().add(new BN(60 * 1))
const endTime: BN = startTime.add(new BN(1512000))
const delegationFee: number = 10

const main = async (): Promise<any> => {
  const stakeAmount: any = await pchain.getMinStake()
  console.log(stakeAmount.minValidatorStake.toString())
  console.log(stakeAmount.minDelegatorStake.toString())
  const platformVMUTXOResponse: any = await pchain.getUTXOs(pAddressStrings)
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

  const unsignedTx: UnsignedTx = await pchain.buildAddValidatorTx(
    utxoSet,
    pAddressStrings,
    pAddressStrings,
    pAddressStrings,
    nodeID,
    startTime,
    endTime,
    // stakeAmount.minValidatorStake,
    new BN("10000000000000"),
    pAddressStrings,
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

main()