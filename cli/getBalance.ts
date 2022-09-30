import { cAddressHex, pAddressBech32, pchain, web3 } from '../src/constants'
import { BN } from 'flare/dist'

async function main() {
    const pbalance = (new BN((await pchain.getBalance(pAddressBech32)).balance)).toString()
    const cbalance = (new BN(await web3.eth.getBalance(cAddressHex))).toString()
    console.log(`${pAddressBech32}: ${pbalance}`)
    console.log(`${cAddressHex}: ${cbalance}`)
}

main()