import { fromHexToBech32 } from '../src/utils'
const yargs = require('yargs')

const args = yargs
  .option('address', {
    alias: 'a',
    description: 'c-chain hex address',
    demand: true,
    type: 'string',
  })
  .option('network', {
    alias: 'n',
    description: 'network name',
    demand: true,
    default: 'localflare',
    type: 'string',
  }).argv

const addressBech32 = fromHexToBech32(args.network, args.address)
console.log(`P-chain address: P-${addressBech32}`)
