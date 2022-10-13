const { networkID } = require('../src/config')
import { parseToID, toValidatorConfigHash, sleepms } from '../src/utils'
import { addValidator } from '../src/addValidator'
import { BN } from '@flarenetwork/flarejs/dist'


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
    nodeId: "NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK",
    pChainAddress: "P-costwo1pynhfl09rfrf20s83lf6ra5egqylmx75xnwdcm",
    stake: "10000000000000",
    duration: "1512000"
  },
  {
    nodeId: 'NodeID-NZSS8sNLobmi4eZwwKX2NFuc8MAhQNfe7',
    pChainAddress: 'P-costwo16xd77u7gdkayd52mcjm6wzqjv9pvfgdt5fq3mq',
    stake: '5000000000000',
    duration: '90000',
  },
  {
    nodeId: 'NodeID-2yRFUEXQFty2X3JAwRpfmvbuw52XxDtdj',
    pChainAddress: 'P-costwo1pynhfl09rfrf20s83lf6ra5egqylmx75xnwdcm',
    stake: '2000000000000',
    duration: '90000',
  },
  {
    nodeId: 'NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ',
    pChainAddress: 'P-costwo12r5tfpdw29crcwwltd203w5n2ufspgg8cvw4x3',
    stake: '2000000000000',
    duration: '90000'
  },
  {
    nodeId: 'NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN',
    pChainAddress: 'P-costwo12r5tfpdw29crcwwltd203w5n2ufspgg8cvw4x3',
    stake: '2000000000000',
    duration: '90000'
  },
  {
    nodeId: 'NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu',
    pChainAddress: 'P-costwo12r5tfpdw29crcwwltd203w5n2ufspgg8cvw4x3',
    stake: '2000000000000',
    duration: '90000'
  }
]

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

let hashes = getHashes(configs)
console.log(hashes)
//addValidators([configs[1]])