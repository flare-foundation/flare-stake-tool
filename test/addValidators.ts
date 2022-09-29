import { parseToID, toValidatorConfigHash, sleepms } from '../src/utils'
import { addValidator } from '../src/addValidator'
const { networkID } = require('../config.ts')
import { BN } from 'flare/dist'
import { exit } from 'process'

function getHashes(validatorConfigs: any[]) {
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
}

async function addValidators(validatorConfigs: any[]) {
  for (let config of validatorConfigs) {
    console.log(`adding ${config.nodeId}`)
    try {
      await addValidator(
        config.nodeId,
        new BN(config.stake),
        new BN(config.duration)
      )
    } catch (e) {
      console.log(e)
    }
    await sleepms(3 * 1000)
  }
}

const configs = [
  {
    nodeId: 'NodeID-NZSS8sNLobmi4eZwwKX2NFuc8MAhQNfe7',
    pChainAddress: 'P-costwo1c7palz59papw0al9wqfht8pgtj48q84krnneq9',
    stake: '5000000000000',
    duration: '3600',
  },
  {
    nodeId: 'NodeID-2yRFUEXQFty2X3JAwRpfmvbuw52XxDtdj',
    pChainAddress: 'P-costwo1atvujwme4e7ptyd3ldfj80th06rwz5x5yuudzz',
    stake: '2000000000000',
    duration: '3600',
  },
]

addValidators(configs)
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
