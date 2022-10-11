import { pchain, cchain, xchain, avaxAssetID } from "../src/constants"

const pchainId = pchain.getBlockchainID()
const cchainId = cchain.getBlockchainID()
const xchainId = xchain.getBlockchainID()

console.log(`blockchainId for P-chain: ${pchainId}`)
console.log(`blockchainId for C-chain: ${cchainId}`)
console.log(`blockchainId for X-chain: ${xchainId}`)
console.log(`assetId: ${avaxAssetID}`)