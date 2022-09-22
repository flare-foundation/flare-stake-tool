import { addValidator } from '../src/addValidator'
import { BN } from 'avalanche/dist'

addValidator(process.argv[2], new BN(process.argv[3]), new BN(process.argv[4]))
