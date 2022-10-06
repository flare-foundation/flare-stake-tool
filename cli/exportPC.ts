import { decimalToInteger } from '../src/utils'
import { exportTxPC } from '../src/pvmExchange'
import { BN } from '@flarenetwork/flarejs/dist'
const yargs = require('yargs')

const args = yargs
  .option('amount', {
    alias: 'a',
    description: 'amount of funds to export from C-chain to P-chain',
    demand: false,
    type: 'string',
  })
  .option('fee', {
    alias: 'f',
    description: 'fee to use when exporting (subtracted from amount)',
    demand: false,
    default: undefined,
    type: 'string',
  }).argv

let amount = args.amount
let fee = args.fee
if (amount !== undefined) 
    amount = new BN(decimalToInteger(args.amount, 9))
if (fee !== undefined) 
    fee = new BN(fee)

exportTxPC(amount, fee)