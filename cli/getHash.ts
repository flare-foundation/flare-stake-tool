const { networkID } = require('../config.ts')
import { pAddressBech32 } from '../src/constants'
import { parseToID, toValidatorConfigHash } from '../src/utils'

/* example parameters
const nodeID = "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5"
const weight = "10000000000000"
const duration = "1512000" */

const nodeID = process.argv[2]
const weight = process.argv[3]
const duration = process.argv[4]

const configHash = toValidatorConfigHash(
  networkID.toString(),
  parseToID(pAddressBech32),
  nodeID,
  weight,
  duration
)
console.log(`Validator configuration hash: ${configHash}`)
