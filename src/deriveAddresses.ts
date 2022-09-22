import { cAddressHex, pAddressBech32 } from './constants'
import { parseToID } from './utils'

const publicKey = parseToID(pAddressBech32)

console.log(`P-chain address: ${pAddressBech32}`)
console.log(`C-chain address hex: ${cAddressHex}`)
console.log(`public key: ${publicKey}`)