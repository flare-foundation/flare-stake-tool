import { pchain, pAddressBech32 } from '../src/constants'
import { fromHexToBech32 } from '../src/utils'

let addr1 = '0xc783df8a850f42e7f7e57013759c285caa701eb6'
let addr2 = '0xead9c93b79ae7c1591b1fb5323bd777e86e150d4'

console.log(fromHexToBech32('costwo', addr1))
console.log(fromHexToBech32('costwo', addr2))

async function main() {
  console.log(await pchain.getBalance(pAddressBech32))
}

main().catch(err => console.log(err))
