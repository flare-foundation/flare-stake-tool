import { pchain, cchain, xchain } from "../src/constants"

async function main() {
  const pchainId = pchain.getBlockchainID()
  const cchainId = cchain.getBlockchainID()
  const xchainId = xchain.getBlockchainID()
  const assetId = await pchain.getStakingAssetID()

  console.log(`blockchainId for P-chain: ${pchainId}`)
  console.log(`blockchainId for C-chain: ${cchainId}`)
  console.log(`blockchainId for X-chain: ${xchainId}`)
  console.log(`assetId: ${assetId}`)
}

main()