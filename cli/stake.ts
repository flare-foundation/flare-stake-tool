import { addValidator } from '../src/addValidator'
import { BN } from 'flare/dist'
const yargs = require('yargs')

const args = yargs
  .option('nodeID', {
    alias: 'id',
    description: 'id of the node that is being added to validation',
    demand: true,
    type: 'string',
  })
  .option('amount', {
    alias: 'a',
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

addValidator(args.nodeID, new BN(args.amount), new BN(args.duration))
