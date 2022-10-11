const { hrp } = require('../config.ts')
import { formatBech32 } from '../src/utils'
const yargs = require('yargs')

const args = yargs
  .option('public key', {
    alias: 'p',
    description: 'secp256k1 public key',
    demand: true,
    type: 'string',
  }).argv

const bech32 = formatBech32(hrp, args.p)
console.log(`P-chain address: P-${bech32}`)