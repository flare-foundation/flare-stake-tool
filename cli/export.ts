import { exportTxCP } from '../src/exportTxCP'
import { BN } from 'avalanche/dist'

exportTxCP(new BN(process.argv[2]), new BN(process.argv[3]))
