import { 
  parseToID, integerToDecimal, formatBech32,
  decimalToInteger, toValidatorConfigHash 
} from './utils'
import {
  networkID, hrp,
  cAddressHex, pAddressBech32, xAddressBech32, 
  cchain, pchain, xchain, web3, avaxAssetID 
} from './constants'
import { exportTxCP, importTxPC } from './evmAtomicTx'
import { exportTxPC, importTxCP } from './pvmAtomicTx'
import { addValidator } from './addValidator'
import { Program } from '@caporal/core'
import { BN } from '@flarenetwork/flarejs/dist'

export const cli = async (program: Program) => {
  program
    // information about the network
    .command("info", "Relevant information")
    .argument("<type>", "Type of information")
    .action(async ({ logger, args, options }: any) => {
      if (args.type == 'addresses') {
        getAddressInfo(logger)
      } else if (args.type == 'balance') {
        await getBalanceInfo(logger)
      } else if (args.type == 'network') {
        getNetworkInfo(logger)
      } else if (args.type == 'livenetwork') {
        // implement this nicely
      } else if (args.type == 'validators') {
        await getValidatorInfo(logger)
      }
    })

    // moving funds from one chain to another
    .command("crosschain", "Move funds from one chain to another")
    .argument("<type>", "Type of a crosschain transaction")
    .option("-a, --amount <amount>", "Amount to transfer")
    .option("-f, --fee <fee>", "Fee of a transaction")
    .action(async ({ logger, args, options }: any) => {
      if (args.type == 'exportCP') {
        await exportCP(logger, options.amount, options.fee)
      } else if (args.type == 'importCP') {
        await importCP(logger)
      } else if (args.type == 'exportPC') {
        await exportPC(logger, options.amount)
      } else if (args.type == 'importPC') {
        await importPC(logger, options.fee)
      }
    })
    // staking
    .command("stake", "Stake funds on the P-chain") 
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-w, --weight <weight>", "Weight or amount to stake")
    .option("-d, --duration <duration>", "Duration of the staking process")
    .action(async ({ logger, args, options }: any) => {
      await stake(options.nodeID, options.weight, options.duration)
    })
    // hashing validator configuration
    .command("hash", "Utilities to calculate validator config hashes")
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-w, --weight <weight>", "Weight or amount to stake")
    .option("-d, --duration <duration>", "Duration of the staking process")
    .option("-a, --address <address>",
      "Validator's address in Bech32 format (default is derived from logged private key)")
    .action(async ({ logger, args, options }: any) => {
      await getHash(options.nodeID, options.weight, options.duration, options.address)
    })
    // converting addresses
    .command("convert", "Utility for conversion of address formats") 
    .argument("<type>", "Type of conversion") 
    .option("-p, --public-key <pubk>", "User's secp256k1 public key")
    .action(async ({ logger, args, options }: any) => {
      if (args.type == 'PChainAddressFromPublicKey') {
        getAddressFromPublicKey(logger, options.pubk)
      }
    })
  }

function getAddressInfo(logger: any) {
  const publicKey = parseToID(pAddressBech32)
  logger.info(`P-chain address: ${pAddressBech32}`)
  logger.info(`C-chain address hex: ${cAddressHex}`)
  logger.info(`public key: ${publicKey}`)
}

async function getBalanceInfo(logger: any) {
  let cbalance = (new BN(await web3.eth.getBalance(cAddressHex))).toString()
  let pbalance = (new BN((await pchain.getBalance(pAddressBech32)).balance)).toString()
  let xbalance = (new BN((await xchain.getBalance(xAddressBech32, avaxAssetID)).balance)).toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  xbalance = integerToDecimal(xbalance, 9)
  logger.info(`${cAddressHex}: ${cbalance}`)
  logger.info(`${pAddressBech32}: ${pbalance}`)
  logger.info(`${xAddressBech32}: ${xbalance}`)
}

function getNetworkInfo(logger: any) {
  const pchainId = pchain.getBlockchainID()
  const cchainId = cchain.getBlockchainID()
  const xchainId = xchain.getBlockchainID()
  logger.info(`blockchainId for P-chain: ${pchainId}`)
  logger.info(`blockchainId for C-chain: ${cchainId}`)
  logger.info(`blockchainId for X-chain: ${xchainId}`)
  logger.info(`assetId: ${avaxAssetID}`)
}

async function getValidatorInfo(logger: any) {
  const pending = await pchain.getPendingValidators()
  const current = await pchain.getCurrentValidators()
  logger.info('pending validators:')
  logger.info(pending)
  logger.info('current validators:')
  logger.info(current)
}

async function exportCP(logger: any, amount: string, fee?: string) {
  const famount: BN = new BN(decimalToInteger(amount, 9))
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await exportTxCP(famount, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function importCP(logger: any) {
  const { txid } = await importTxCP()
  logger.info(`Success! TXID: ${txid}`)
}

async function exportPC(logger: any, amount?: string) {
  const famount = (amount === undefined) ? 
    amount : new BN(decimalToInteger(amount, 9)) 
  logger.info('here')
  const { txid } = await exportTxPC(famount)
  logger.info(`Success! TXID: ${txid}`)
}

async function importPC(logger: any, fee?: string) {
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await importTxPC(ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function stake(nodeID: string, weight: string, duration: string) {
  const fweight = new BN(decimalToInteger(weight, 9))
  const fduration = new BN(duration)
  await addValidator(nodeID, fweight, fduration)
}

async function getHash(
  logger: any,
  nodeID: string, weight: string, 
  duration: string, address?: string
) {
  if (address === undefined) address = parseToID(pAddressBech32)
  const configHash = toValidatorConfigHash(
    networkID.toString(),
    address,
    nodeID,
    weight,
    duration
  )
  logger.info(`Validator configuration hash: ${configHash}`)
}

function getAddressFromPublicKey(logger: any, pubk: string) {
  const bech32 = formatBech32(hrp, pubk)
  logger.info(`P-chain address: P-${bech32}`)
}