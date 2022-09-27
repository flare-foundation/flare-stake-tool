import { exportTxCP } from '../src/exportTxCP'
import { BN } from 'flare/dist'

exportTxCP(new BN(process.argv[2]), new BN(process.argv[3]))
