import { 
  parseToID, integerToDecimal, formatBech32,
  decimalToInteger, toValidatorConfigHash 
} from './utils'
import { contextEnv, Context } from './constants'
import { exportTxCP, importTxPC } from './evmAtomicTx'
import { exportTxPC, importTxCP } from './pvmAtomicTx'
import { addValidator } from './addValidator'
import { Command } from 'commander'
import { BN } from '@flarenetwork/flarejs/dist'
import createLogger from 'logging'

const logger = createLogger('info')

export async function cli(program: Command) {
  // global configurations
  program
    .option("--network <network>", "Network name (flare or costwo)", 'flare')
    .option("--env-path <path>", "Path to the .env file", 'env')
  // information about the network
  program
    .command("info").description("Relevant information")
    .argument("<type>", "Type of information")
    .action(async (type) => {
      const options = program.opts()
      const ctx = contextEnv(options.envPath, options.network)
      if (type == 'addresses') {
        getAddressInfo(ctx)
      } else if (type == 'balance') {
        await getBalanceInfo(ctx)
      } else if (type == 'network') {
        getNetworkInfo(ctx)
      } else if (type == 'livenetwork') {
        // implement this nicely
      } else if (type == 'validators') {
        await getValidatorInfo(ctx)
      }
    })
  // moving funds from one chain to another
  program
    .command("crosschain").description("Move funds from one chain to another")
    .argument("<type>", "Type of a crosschain transaction")
    .option("-a, --amount <amount>", "Amount to transfer")
    .option("-f, --fee <fee>", "Fee of a transaction")
    .action(async (type, options) => {
      options = {...options, ...program.opts()}
      const ctx = contextEnv(options.envPath, options.network)
      if (type == 'exportCP') {
        await exportCP(ctx, options.amount, options.fee)
      } else if (type == 'importCP') {
        await importCP(ctx)
      } else if (type == 'exportPC') {
        await exportPC(ctx, options.amount)
      } else if (type == 'importPC') {
        await importPC(ctx, options.fee)
      }
    })
  // staking
  program
    .command("stake").description("Stake funds on the P-chain") 
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-w, --weight <weight>", "Weight or amount to stake")
    .option("-d, --duration <duration>", "Duration of the staking process")
    .action(async (options) => {
      options = {...options, ...program.opts()}
      const ctx = contextEnv(options.envPath, options.network)
      await stake(ctx, options.nodeId, options.weight, options.duration)
    })
  // hashing validator configuration
  program
    .command("hash").description("Utilities to calculate validator config hashes")
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-w, --weight <weight>", "Weight or amount to stake")
    .option("-d, --duration <duration>", "Duration of the staking process")
    .option("-a, --address <address>",
      "Validator's address in Bech32 format (default is derived from logged private key)")
    .action(async (options) => {
      options = {...options, ...program.opts()}
      const ctx = contextEnv(options.envPath, options.network)
      await getHash(
        ctx, options.nodeId, options.weight, 
        options.duration, options.address
      )
    })
  // converting between address formats
  program
    .command("convert").description("Utility for conversion of address formats") 
    .argument("<type>", "Type of conversion") 
    .option("-p, --public-key <pubk>", "User's secp256k1 public key")
    .action((type, options) => {
      options = {...options, ...program.opts()}
      const ctx = contextEnv(options.envPath, options.network)
      if (type == 'PChainAddressFromPublicKey') {
        getAddressFromPublicKey(ctx, options.publicKey)
      }
    })
  }

function getAddressInfo(ctx: Context) {
  const publicKey = parseToID(ctx.pAddressBech32)
  logger.info(`X-chain address: ${ctx.xAddressBech32}`)
  logger.info(`P-chain address: ${ctx.pAddressBech32}`)
  logger.info(`C-chain address hex: ${ctx.cAddressHex}`)
  logger.info(`secp256k1 public key: ${publicKey}`)
}

async function getBalanceInfo(ctx: Context) {
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

function getNetworkInfo(ctx: Context) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  const xchainId = ctx.xchain.getBlockchainID()
  logger.info(`blockchainId for P-chain: ${pchainId}`)
  logger.info(`blockchainId for C-chain: ${cchainId}`)
  logger.info(`blockchainId for X-chain: ${xchainId}`)
  logger.info(`assetId: ${ctx.avaxAssetID}`)
}

async function getValidatorInfo(ctx: Context) {
  const pending = await ctx.pchain.getPendingValidators()
  const current = await ctx.pchain.getCurrentValidators()
  const fpending = JSON.stringify(pending, null, 2)
  const fcurrent = JSON.stringify(current, null, 2)
  logger.info(`pending: ${fpending}`)
  logger.info(`current: ${fcurrent}`)
}

async function exportCP(ctx: Context, amount: string, fee?: string) {
  const famount: BN = new BN(decimalToInteger(amount, 9))
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await exportTxCP(ctx, famount, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function importCP(ctx: Context) {
  const { txid } = await importTxCP(ctx)
  logger.info(`Success! TXID: ${txid}`)
}

async function exportPC(ctx: Context, amount?: string) {
  const famount = (amount === undefined) ? 
    amount : new BN(decimalToInteger(amount, 9)) 
  const { txid } = await exportTxPC(ctx, famount)
  logger.info(`Success! TXID: ${txid}`)
}

async function importPC(ctx: Context, fee?: string) {
  const ffee = (fee === undefined) ? 
    fee : new BN(decimalToInteger(fee, 9))
  const { txid, usedFee } = await importTxPC(ctx, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function stake(
  ctx: Context, 
  nodeID: string, weight: string, duration: string
) {
  const fweight = new BN(decimalToInteger(weight, 9))
  const fduration = new BN(duration)
  const { txid } = await addValidator(ctx, nodeID, fweight, fduration)
  logger.info(`Success! TXID: ${txid}`)
}

async function getHash(
  ctx: Context, 
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

function getAddressFromPublicKey(ctx: Context, pubk: string) {
  const bech32 = formatBech32(ctx.config.hrp, pubk)
  logger.info(`P-chain address: P-${bech32}`)
}