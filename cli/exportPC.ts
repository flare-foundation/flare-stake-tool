import { decimalToInteger } from '../src/utils'
import { exportTxPC } from '../src/pvmAtomicTx'
import { BN } from '@flarenetwork/flarejs/dist'
const yargs = require('yargs')

const args = yargs
  .option('amount', {
    alias: 'a',
    description: 'amount of funds to export from C-chain to P-chain',
    demand: false,
    type: 'string',
  }).argv

let amount = args.amount
if (amount !== undefined) 
    amount = new BN(decimalToInteger(args.amount, 9))

exportTxPC(amount)