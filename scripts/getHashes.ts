import { localflare } from '../src/config'
import { parseToID, toValidatorConfigHash, sleepms } from '../src/utils'
import { addValidator } from '../src/addValidator'
import { BN } from '@flarenetwork/flarejs/dist'
import { contextEnv } from '../src/constants'

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
        localflare.networkID.toString(),
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
  /* {
    nodeId: 'NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ',
    pChainAddress: 'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    stake: '10000000000000',
    duration: '1512000'
  },
  {
    nodeId: 'NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN',
    pChainAddress: 'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    stake: '10000000000000',
    duration: '1512000'
  },
  {
    nodeId: 'NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu',
    pChainAddress: 'P-localflare1pz6dhzxvfmztknw35ukl8fav6gzjt9xwmkngua',
    stake: '10000000000000',
    duration: '1512000'
  }, */
  // add separately
  {
    nodeId: "NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK",
    pChainAddress: "P-costwo1pynhfl09rfrf20s83lf6ra5egqylmx75xnwdcm",
    stake: "10000000000000",
    duration: "1512000"
  },
]

async function addValidators(validatorConfigs: any[]) {
  const ctx = contextEnv('.env', localflare.hrp)
  for (let config of validatorConfigs) {
    console.log(`adding ${config.nodeId}`)
    try {
      await addValidator(
        ctx,
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
addValidators(configs)