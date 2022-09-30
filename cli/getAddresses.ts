import { cAddressHex, pAddressBech32 } from '../src/constants'
import { parseToID } from '../src/utils'

const publicKey = parseToID(pAddressBech32)

console.log(`P-chain address: ${pAddressBech32}`)
console.log(`C-chain address hex: ${cAddressHex}`)
console.log(`public key: ${publicKey}`)