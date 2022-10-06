import { cAddressHex, pAddressBech32, xAddressBech32, pchain, xchain, web3, avaxAssetID } from '../src/constants'
import { integerToDecimal } from '../src/utils'
import { BN } from '@flarenetwork/flarejs/dist'

async function main() {
    let cbalance = (new BN(await web3.eth.getBalance(cAddressHex))).toString()
    let pbalance = (new BN((await pchain.getBalance(pAddressBech32)).balance)).toString()
    let xbalance = (new BN((await xchain.getBalance(xAddressBech32, avaxAssetID)).balance)).toString()
    cbalance = integerToDecimal(cbalance, 18)
    pbalance = integerToDecimal(pbalance, 9)
    xbalance = integerToDecimal(xbalance, 9)
    console.log(`${cAddressHex}: ${cbalance}`)
    console.log(`${pAddressBech32}: ${pbalance}`)
    console.log(`${xAddressBech32}: ${xbalance}`)
}

main()