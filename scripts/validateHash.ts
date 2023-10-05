import fs from 'fs'
import { sha256 } from "ethers"
import { UnsignedTx } from '@flarenetwork/flarejs/dist/apis/evm'
import { Buffer as FlrBuffer } from '@flarenetwork/flarejs'
import { UnsignedTxJson } from "../src/interfaces"

const filename = "./proofs/45c112.unsignedTx.json" // change to yours

const data = JSON.parse(fs.readFileSync(filename).toString()) as UnsignedTxJson
const hash = sha256(Buffer.from(data.unsignedTransactionBuffer, 'hex'))
const tx = new UnsignedTx()
tx.fromBuffer(FlrBuffer.from(data.unsignedTransactionBuffer, 'hex'))

console.log(JSON.stringify(tx.getTransaction().serialize(), null, 2))
console.log(`If you agree with the above transaction, you agree with signing hash ${hash}.`)