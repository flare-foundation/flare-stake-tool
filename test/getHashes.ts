const { networkID } = require('../config.ts')
import { parseToID, toValidatorConfigHash } from '../src/utils'

interface ValidatorConfig {
  nodeId: string,
  pChainAddress: string,
  stake: string,
  duration: string
}

function getHashes(validatorConfigs: ValidatorConfig[]) {
  const hashes: string[] = []
  for (let config of validatorConfigs) {
    hashes.push(
      toValidatorConfigHash(
        networkID.toString(),
        parseToID(config.pChainAddress),
        config.nodeId,
        config.stake,
        config.duration
      )
    )
  }
  return hashes
}

const configs: ValidatorConfig[] = [
  {
    nodeId: 'NodeID-NZSS8sNLobmi4eZwwKX2NFuc8MAhQNfe7',
    pChainAddress: 'P-costwo16xd77u7gdkayd52mcjm6wzqjv9pvfgdt5fq3mq',
    stake: '5000000000000',
    duration: '90000',
  },
  {
    nodeId: 'NodeID-2yRFUEXQFty2X3JAwRpfmvbuw52XxDtdj',
    pChainAddress: 'P-costwo16xd77u7gdkayd52mcjm6wzqjv9pvfgdt5fq3mq',
    stake: '2000000000000',
    duration: '90000',
  },
]

let hashes = getHashes(configs)
console.log(hashes)