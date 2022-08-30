const { protocol, ip, port, networkID, privateKey, cAddressHex } = require("../config.ts")
import { Avalanche } from "avalanche/dist"
import { PlatformVMAPI, KeyChain as pKeyChain } from "avalanche/dist/apis/platformvm"
import { PrivateKeyPrefix } from "avalanche/dist//utils"

const privKey: string = `${PrivateKeyPrefix}${privateKey}`

const avalanche: Avalanche = new Avalanche(ip, port, protocol, networkID)
const pchain: PlatformVMAPI = avalanche.PChain()
const pKeychain: pKeyChain = pchain.keyChain()
pKeychain.importKey(privKey)
const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()

console.log(`P-chain address: ${pAddressStrings}`)
console.log(`C-chain address: ${cAddressHex}`)