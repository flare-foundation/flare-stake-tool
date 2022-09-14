// export c-chain to p-chain

const {
  protocol,
  ip,
  port,
  networkID,
  privateKey,
  cAddressHex,
} = require('../config.ts')
import Web3 from 'web3'
import { Avalanche, BinTools, Buffer, BN } from 'avalanche'
import { AVMAPI, KeyChain as AVMKeyChain } from 'avalanche/dist/apis/avm'
import {
  EVMAPI,
  KeyChain as EVMKeyChain,
  UnsignedTx,
  Tx,
} from 'avalanche/dist/apis/evm'
import {
  PlatformVMAPI,
  KeyChain as PVMKeyChain,
} from 'avalanche/dist/apis/platformvm'
import { PrivateKeyPrefix, Defaults } from 'avalanche/dist/utils'

const avalanche = new Avalanche(ip, port, protocol, networkID)
const xchain: AVMAPI = avalanche.XChain()
const cchain: EVMAPI = avalanche.CChain()
const pchain: PlatformVMAPI = avalanche.PChain()
const privKey = `${PrivateKeyPrefix}${privateKey}`
const xKeychain: AVMKeyChain = xchain.keyChain()
const cKeychain: EVMKeyChain = cchain.keyChain()
const pKeychain: PVMKeyChain = pchain.keyChain()
xKeychain.importKey(privKey)
cKeychain.importKey(privKey)
pKeychain.importKey(privKey)
const xAddressStrings: string[] = xKeychain.getAddressStrings()
const cAddressStrings: string[] = cKeychain.getAddressStrings()
const pAddressStrings: string[] = pKeychain.getAddressStrings()
const xChainBlockchainIdStr: string = Defaults.network[networkID].X.blockchainID
const pChainBlockchainIdStr: string = Defaults.network[networkID].P.blockchainID
const avaxAssetID: string = Defaults.network[networkID].P.avaxAssetID! // same for X = P
const cHexAddress: string = cAddressHex

const path = '/ext/bc/C/rpc'
const web3 = new Web3(`${protocol}://${ip}:${port}${path}`)
const threshold = 1

const main = async (): Promise<any> => {
  const baseFeeResponse: string = await cchain.getBaseFee()
  const baseFee = new BN(parseInt(baseFeeResponse, 16))
  const txcount = await web3.eth.getTransactionCount(cHexAddress)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  let avaxAmount: BN = new BN(process.argv[2])
  let fee: BN = baseFee.div(new BN(1e9))
  fee = fee.add(new BN(1e6))

  console.log('chainid', pChainBlockchainIdStr)

  let unsignedTx: UnsignedTx = await cchain.buildExportTx(
    avaxAmount,
    avaxAssetID,
    pChainBlockchainIdStr,
    cHexAddress,
    cAddressStrings[0],
    pAddressStrings,
    nonce,
    locktime,
    threshold,
    fee
  )

  const tx: Tx = unsignedTx.sign(cKeychain)
  const txid = await cchain.issueTx(tx)
  const txstatus = await cchain.getAtomicTxStatus(txid)

  let balance: BN = new BN(await web3.eth.getBalance(cHexAddress))
  balance = new BN(balance.toString().substring(0, 11))

  console.log(`TXID: ${txid}, Status ${txstatus}`)
  console.log(
    `exported ${avaxAmount} from ${cHexAddress} to ${pAddressStrings}`
  )
  console.log(`balance: ${balance}`)
}

main()
