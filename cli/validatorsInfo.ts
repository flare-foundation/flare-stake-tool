import { pchain } from '../src/constants'

async function main() {
  const pending = await pchain.getPendingValidators()
  const current = await pchain.getCurrentValidators()
  console.log('pending validators:')
  console.log(pending)
  console.log('current validators:')
  console.log(current)
}

main()