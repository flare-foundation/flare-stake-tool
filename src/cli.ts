import { 
  parseToID, integerToDecimal, formatBech32,
  decimalToInteger, toValidatorConfigHash 
} from './utils'
import { contextEnv, Context } from './constants'
import { exportTxCP, importTxPC } from './evmAtomicTx'
import { exportTxPC, importTxCP } from './pvmAtomicTx'
import { addValidator } from './addValidator'
import { Program } from '@caporal/core'
import { BN } from '@flarenetwork/flarejs/dist'

export async function cli(program: Program) {
  const validatorstring = { validator: program.STRING }
  program
    // global configurations
    .option("--network", "Network name (flare or costwo)", {
      validator: program.STRING,
      global: true,
      default: 'flare'
    })
    .option("--env-path", "Path to the .env file", {
      validator: program.STRING,
      global: true,
      default: 'env'
    })
    // information about the network
    .command("info", "Relevant information")
    .argument("<type>", "Type of information")
    .action(async ({ logger, args, options }: any) => {
      const ctx = contextEnv(options.envPath, options.network)
      if (args.type == 'addresses') {
        getAddressInfo(ctx, logger)
      } else if (args.type == 'balance') {
        await getBalanceInfo(ctx, logger)
      } else if (args.type == 'network') {
        getNetworkInfo(ctx, logger)
      } else if (args.type == 'livenetwork') {
        // implement this nicely
      } else if (args.type == 'validators') {
        await getValidatorInfo(ctx, logger)
      }
    })
    // moving funds from one chain to another
    .command("crosschain", "Move funds from one chain to another")
    .argument("<type>", "Type of a crosschain transaction")
    .option("-a, --amount <amount>", "Amount to transfer", validatorstring)
    .option("-f, --fee <fee>", "Fee of a transaction", validatorstring)
    .action(async ({ logger, args, options }: any) => {
      const ctx = contextEnv(options.envPath, options.network)
      if (args.type == 'exportCP') {
        await exportCP(ctx, logger, options.amount, options.fee)
      } else if (args.type == 'importCP') {
        await importCP(ctx, logger)
      } else if (args.type == 'exportPC') {
        await exportPC(ctx, logger, options.amount)
      } else if (args.type == 'importPC') {
        await importPC(ctx, logger, options.fee)
      }
    })
    // staking
    .command("stake", "Stake funds on the P-chain") 
    .option("-n, --node-id <nodeID>", "The staking node's id", validatorstring)
    .option("-w, --weight <weight>", "Weight or amount to stake", validatorstring)
    .option("-d, --duration <duration>", "Duration of the staking process", validatorstring)
    .action(async ({ logger, args, options }: any) => {
      const ctx = contextEnv(options.envPath, options.network)
      await stake(ctx, logger, options.nodeId, options.weight, options.duration)
    })
    // hashing validator configuration
    .command("hash", "Utilities to calculate validator config hashes")
    .option("-n, --node-id <nodeID>", "The staking node's id", validatorstring)
    .option("-w, --weight <weight>", "Weight or amount to stake", validatorstring)
    .option("-d, --duration <duration>", "Duration of the staking process", validatorstring)
    .option("-a, --address <address>",
      "Validator's address in Bech32 format (default is derived from logged private key)", 
      validatorstring)
    .action(async ({ logger, args, options }: any) => {
      const ctx = contextEnv(options.envPath, options.network)
      await getHash(
        ctx, logger, options.nodeId, options.weight, 
        options.duration, options.address
      )
    })
    // converting addresses
    .command("convert", "Utility for conversion of address formats") 
    .argument("<type>", "Type of conversion") 
    .option("-p, --public-key <pubk>", "User's secp256k1 public key", validatorstring)
    .action(({ logger, args, options }: any) => {
      const ctx = contextEnv(options.envPath, options.network)
      if (args.type == 'PChainAddressFromPublicKey') {
        getAddressFromPublicKey(ctx, logger, options.publicKey)
      }
    })
  }

function getAddressInfo(ctx: Context, logger: any) {
  const publicKey = parseToID(ctx.pAddressBech32)
  logger.info(`X-chain address: ${ctx.xAddressBech32}`)
  logger.info(`P-chain address: ${ctx.pAddressBech32}`)
  logger.info(`C-chain address hex: ${ctx.cAddressHex}`)
  logger.info(`secp256k1 public key: ${publicKey}`)
}

async function getBalanceInfo(ctx: Context, logger: any) {
  let cbalance = (new BN(await ctx.web3.eth.getBalance(ctx.cAddressHex))).toString()
  let pbalance = (new BN((await ctx.pchain.getBalance(ctx.pAddressBech32)).balance)).toString()
  let xbalance = (new BN((await ctx.xchain.getBalance(ctx.xAddressBech32, ctx.avaxAssetID)).balance)).toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  xbalance = integerToDecimal(xbalance, 9)
  logger.info(`${ctx.cAddressHex}: ${cbalance}`)
  logger.info(`${ctx.pAddressBech32}: ${pbalance}`)
  logger.info(`${ctx.xAddressBech32}: ${xbalance}`)
}

function getNetworkInfo(ctx: Context, logger: any) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  const xchainId = ctx.xchain.getBlockchainID()
  logger.info(`blockchainId for P-chain: ${pchainId}`)
  logger.info(`blockchainId for C-chain: ${cchainId}`)
  logger.info(`blockchainId for X-chain: ${xchainId}`)
  logger.info(`assetId: ${ctx.avaxAssetID}`)
}

async function getValidatorInfo(ctx: Context, logger: any) {
  const pending = await ctx.pchain.getPendingValidators()
  const current = await ctx.pchain.getCurrentValidators()
  logger.info('pending validators:')
  logger.info(JSON.stringify(pending))
  logger.info('current validators:')
  logger.info(JSON.stringify(current))
}

async function exportCP(ctx: Context, logger: any, amount: string, fee?: string) {
  const famount: BN = new BN(decimalToInteger(amount, 9))
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await exportTxCP(ctx, famount, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function importCP(ctx: Context, logger: any) {
  const { txid } = await importTxCP(ctx)
  logger.info(`Success! TXID: ${txid}`)
}

async function exportPC(ctx: Context, logger: any, amount?: string) {
  const famount = (amount === undefined) ? 
    amount : new BN(decimalToInteger(amount, 9)) 
  const { txid } = await exportTxPC(ctx, famount)
  logger.info(`Success! TXID: ${txid}`)
}

async function importPC(ctx: Context, logger: any, fee?: string) {
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await importTxPC(ctx, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function stake(
  ctx: Context, logger: any, 
  nodeID: string, weight: string, duration: string
) {
  const fweight = new BN(decimalToInteger(weight, 9))
  const fduration = new BN(duration)
  const { txid } = await addValidator(ctx, nodeID, fweight, fduration)
  logger.info(`Success! TXID: ${txid}`)
}

async function getHash(
  ctx: Context, logger: any, 
  nodeID: string, weight: string, 
  duration: string, address?: string
) {
  if (address === undefined) address = ctx.pAddressBech32
  const configHash = toValidatorConfigHash(
    ctx.config.networkID.toString(),
    parseToID(address),
    nodeID,
    decimalToInteger(weight, 9),
    duration
  )
  logger.info(`Validator configuration hash: ${configHash}`)
}

function getAddressFromPublicKey(ctx: Context, logger: any, pubk: string) {
  const bech32 = formatBech32(ctx.config.hrp, pubk)
  logger.info(`P-chain address: P-${bech32}`)
}