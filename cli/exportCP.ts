import { exportTxCP } from '../src/exportTxCP'
import { BN } from 'flare/dist'
const yargs = require('yargs')

const args = yargs
  .option('amount', {
    alias: 'a',
    description: 'amount of funds to export from C-chain to P-chain',
    demand: true,
    type: 'string',
  })
  .option('fee', {
    alias: 'f',
    description: 'fee to use when exporting (subtracted from amount)',
    demand: false,
    default: undefined,
    type: 'string',
  }).argv

exportTxCP(new BN(args.amount), new BN(args.fee))