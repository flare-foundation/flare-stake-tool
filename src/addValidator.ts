const { protocol, ip, port, networkID, privateKey } = require('../config.ts')
import { Avalanche, BN, Buffer } from 'avalanche/dist'
import {
  PlatformVMAPI,
  KeyChain,
  UTXOSet,
  UnsignedTx,
  Tx,
} from 'avalanche/dist/apis/platformvm'
import { PrivateKeyPrefix, UnixNow } from 'avalanche/dist/utils'


const avalanche: Avalanche = new Avalanche(ip, port, protocol, networkID)
const pchain: PlatformVMAPI = avalanche.PChain()
const pKeychain: KeyChain = pchain.keyChain()
const privKey = `${PrivateKeyPrefix}${privateKey}`
pKeychain.importKey(privKey)
const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const threshold = 1
const locktime: BN = new BN(0)
const memo: Buffer = Buffer.from(
  'PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet'
)
const asOf: BN = UnixNow()
const startTime: BN = UnixNow().add(new BN(60 * 1))
const endTime: BN = startTime.add(new BN(1512000))
const delegationFee = 10

async function addValidator (nodeID: string): Promise<any> {
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
    new BN('10000000000000'),
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

const nodesToAdd = [
/*   "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ",
  "NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN",
  "NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu", */
  "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5"
]

async function sleepms(milliseconds: number) {
  await new Promise((resolve: any) => {
    setTimeout(() => {
      resolve();
    }, milliseconds);
  });
}

async function main() {
  for (let i = 0; i < nodesToAdd.length; i++) {
    console.log(`adding ${i} ${nodesToAdd[i]}`)
    try {
      await addValidator(nodesToAdd[i])
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

