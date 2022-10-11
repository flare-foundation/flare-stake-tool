import { decimalToInteger } from '../src/utils'
import { exportTxCP } from '../src/evmAtomicTx'
import { BN } from '@flarenetwork/flarejs/dist'
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
    description: 'fee to use when exporting',
    demand: false,
    default: undefined,
    type: 'string',
  }).argv

const amount = new BN(decimalToInteger(args.amount, 9))
let fee = args.fee
if (fee !== undefined) 
    fee = new BN(decimalToInteger(fee, 9))
exportTxCP(amount, fee)