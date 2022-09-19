const { protocol, ip, port, networkID, privateKey, cAddressHex } = require('../config.ts')
import { Avalanche } from 'avalanche/dist'
import { PrivateKeyPrefix } from 'avalanche/dist//utils'
import { ParseToID, ToValidatorConfigHash } from './validatorConfigHashing'

const privKey = `${PrivateKeyPrefix}${privateKey}`

const avalanche: Avalanche = new Avalanche(ip, port, protocol, networkID)
const pchain = avalanche.PChain()
const cchain = avalanche.CChain()
const pKeychain = pchain.keyChain()
const cKeychain = cchain.keyChain()
pKeychain.importKey(privKey)
cKeychain.importKey(privKey)
const pAddressStrings: string[] = pchain.keyChain().getAddressStrings()
const cAddressStrings: string[] = cchain.keyChain().getAddressStrings()

const pChainPublicKey = ParseToID(pAddressStrings[0])
const nodeID = "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5"
const weight = "10000000000000"
const duration = "1512000"
const configHash = ToValidatorConfigHash(networkID.toString(), pChainPublicKey, nodeID, weight, duration)

console.log(`P-chain address: ${pAddressStrings}`)
console.log(`C-chain address: ${cAddressStrings}`)
console.log(`C-chain address hex: ${cAddressHex}`)
console.log(`Validator config hash: ${configHash}`)
