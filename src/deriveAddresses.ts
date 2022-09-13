const {
  protocol,
  ip,
  port,
  networkID,
  privateKey,
  cAddressHex,
} = require('../config.ts')
import { Avalanche } from 'avalanche/dist'
import { PrivateKeyPrefix } from 'avalanche/dist//utils'

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

console.log(`P-chain address: ${pAddressStrings}`)
console.log(`C-chain address: ${cAddressStrings}`)
console.log(`C-chain address hex: ${cAddressHex}`)
