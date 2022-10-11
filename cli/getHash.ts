const { networkID } = require('../config.ts')
import { pAddressBech32 } from '../src/constants'
import { parseToID, toValidatorConfigHash } from '../src/utils'
const yargs = require('yargs')

const args = yargs
  .option('nodeID', {
    alias: 'id',
    description: 'id of the node that is being added to validation',
    demand: true,
    type: 'string',
  })
  .option('weight', {
    alias: 'w',
    description: 'validator\'s staking amount',
    demand: true,
    type: 'string',
  })
  .option('duration', {
    alias: 'd',
    description: 'validator\'s staking duration',
    demand: true,
    type: 'string',
  }).argv

const configHash = toValidatorConfigHash(
  networkID.toString(),
  parseToID(pAddressBech32),
  args.nodeID,
  args.weight,
  args.duration
)
console.log(`Validator configuration hash: ${configHash}`)
