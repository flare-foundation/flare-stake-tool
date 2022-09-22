import converter from "bech32-converting"
import { parseToID, toValidatorConfigHash, sleepms } from "../src/utils"
import { cAddressBech32 } from "../src/constants"
import { addValidator } from "../src/addValidator"
const { networkID } = require('../config.ts')
import { BN, Buffer } from 'avalanche/dist'
import { exit } from "process"

let _cAddressBech = 'C-localflare1pynhfl09rfrf20s83lf6ra5egqylmx75dmpf9s'
let _cAddressHex = '0x092774fde51a46953e078fd3a1f6994009fd9bd4'

let cAddressHex2 = converter('localflare').toHex('localflare1pynhfl09rfrf20s83lf6ra5egqylmx75dmpf9s')
// localflare1pynhfl09rfrf20s83lf6ra5egqylmx75dmpf9s
let cAddressBech = converter('localflare').toBech32('092774fde51a46953e078fd3a1f6994009fd9bd4')
// 0x092774FDE51A46953e078fD3a1F6994009FD9bD4

console.log(cAddressHex2)
console.log(cAddressBech)

const nodeIds = [
    "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ",
    "NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN",
    "NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu",
    //"NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5"
]
const weights = [
    "10000000000000",
    "5000000000000",
    "2000000000000",
    "2000000000000"
]
const rewardAddresses = [
    'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua'
]
const secpk = parseToID(cAddressBech32)
const duration = "1512000"

const hashes: string[] = []
for (let i = 0; i < nodeIds.length; i++) {
    hashes.push(toValidatorConfigHash(
        networkID.toString(), secpk, nodeIds[i], 
        weights[i], duration
    ))
}

async function main() {
    for (let i = 0; i < nodeIds.length; i++) {
        console.log(`adding ${i} ${nodeIds[i]}`)
        try {
            await addValidator(nodeIds[i], new BN(weights[i]), new BN(duration))
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

main()