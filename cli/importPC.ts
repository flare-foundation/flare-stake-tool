import { importTxPC } from '../src/evmAtomicTx'
import { decimalToInteger } from '../src/utils'
import { BN } from '@flarenetwork/flarejs/dist'
const yargs = require('yargs')

const args = yargs
  .option('fee', {
    alias: 'f',
    description: 'fee to use when exporting',
    demand: false,
    default: undefined,
    type: 'string',
  }).argv

let fee = args.fee
if (fee !== undefined) 
    fee = new BN(decimalToInteger(fee, 9))
importTxPC(fee)
