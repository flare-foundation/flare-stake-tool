import { Command, OptionValues } from 'commander'
import { BN } from '@flarenetwork/flarejs/dist'
import createLogger from 'logging'
import { compressPublicKey, integerToDecimal, shiftDecimals as shiftDecimals } from './utils'
import { contextEnv, contextFile, Context } from './constants'
import { exportTxCP, importTxPC, issueSignedEvmTx, getUnsignedExportTxCP } from './evmAtomicTx'
import { exportTxPC, importTxCP, getUnsignedImportTxCP, issueSignedPvmTx } from './pvmAtomicTx'
import { addValidator, getUnsignedAddValidator } from './addValidator'
import { addDelegator, getUnsignedAddDelegator } from './addDelegator'
import { getSignature, sendToForDefi } from './forDefi'
import { initContext, DERIVATION_PATH } from './ledger/key'
import { sign } from './ledger/sign'

const logger = createLogger('info')

export async function cli(program: Command) {
  // global configurations
  program
    .option("--network <network>", "Network name (flare or costwo)", 'flare')
    .option("--env-path <path>", "Path to the .env file", 'env')
    .option("--ctx-file <file>", "Context file as returned by ledger commnunication tool")
    .option("--get-hashes", "Get hashes of transaction to sign")
    .option("--use-signatures", "Use hash signatures to finalize the transaction")
  // information about the network
  program
    .command("info").description("Relevant information")
    .argument("<type>", "Type of information")
    .action(async (type: string) => {
      logger.info("Getting information about the network")
      const options = program.opts()
      const ctx = (options.ctxFile) ?
        contextFile(options.ctxFile) :
        contextEnv(options.envPath, options.network)
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
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (type: string, options: OptionValues) => {
      options = { ...options, ...program.opts() }
      const ctx = (options.ctxFile) ?
        contextFile(options.ctxFile) :
        contextEnv(options.envPath, options.network)
      if (type == 'exportCP') {
        if (options.getHashes) {
          await exportCP_getHashes(ctx, options.transactionId, options.amount, options.fee)
        } else if (options.useSignatures) {
          await exportCP_useSignatures(ctx, options.transactionId)
        } else {
          await exportCP(ctx, options.amount, options.fee)
        }
      } else if (type == 'importCP') {
        if (options.getHashes) {
          await importCP_getHashes(ctx, options.transactionId)
        } else if (options.useSignatures) {
          await importCP_useSignatures(ctx, options.transactionId)
        } else {
          await importCP(ctx)
        }
      } else if (type == 'exportPC') {
        // two-part p-c export not yet implemented
        await exportPC(ctx, options.amount)
      } else if (type == 'importPC') {
        // two-part p-c import not yet implemented
        await importPC(ctx, options.fee)
      }
    })
  // staking
  program
    .command("stake").description("Stake funds on the P-chain")
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-a, --amount <amount>", "Amount to stake")
    .option("-s, --start-time <start-time>", "Start time of the staking process")
    .option("-e, --end-time <end-time>", "End time of the staking process")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      options = { ...options, ...program.opts() }
      const ctx = (options.ctxFile) ?
        contextFile(options.ctxFile) :
        contextEnv(options.envPath, options.network)
      if (options.getHashes) {
        await stake_getHashes(ctx, options.transactionId, options.nodeId, options.amount, options.startTime, options.endTime)
      } else if (options.useSignatures) {
        await stake_useSignatures(ctx, options.transactionId)
      } else {
        await stake(ctx, options.nodeId, options.amount, options.startTime, options.endTime)
      }
    })
  // delegating
  program
    .command("delegate").description("Delegate funds on the P-chain")
    .option("-n, --node-id <nodeID>", "The staking node's id")
    .option("-a, --amount <amount>", "Amount to delegate")
    .option("-s, --start-time <start-time>", "Start time of the delegation process")
    .option("-e, --end-time <end-time>", "End time of the delegation process")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      options = { ...options, ...program.opts() }
      const ctx = (options.ctxFile) ?
        contextFile(options.ctxFile) :
        contextEnv(options.envPath, options.network)
      if (options.getHashes) {
        await delegate_getHashes(ctx, options.transactionId, options.nodeId, options.amount, options.startTime, options.endTime)
      } else if (options.useSignatures) {
        await delegate_useSignatures(ctx, options.transactionId)
      } else {
        await delegate(ctx, options.nodeId, options.amount, options.startTime, options.endTime)
      }
    })
  // forDefi signing
  program
    .command("forDefi").description("Sign with ForDefi")
    .argument("<type>", "Type of a forDefi transaction")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (type: string, options: OptionValues) => {
      options = { ...options, ...program.opts() }
      const ctx = (options.ctxFile) ? contextFile(options.ctxFile) : contextEnv(options.envPath, options.network)
      if (type == 'sign') {
        await signForDefi(options.transactionId, options.ctxFile)
      } else if (type == 'fetch') {
        await fetchForDefiTx(options.transactionId)
      }
    })
  // ledger signing
  program
    .command("init-ctx").description("Initialize context file from ledger")
    .option("-n, --network <Network>", "Network (HRP)", "flare")
    .action(async (options: OptionValues) => {
      await initContext(DERIVATION_PATH, options.network)
      logger.info("Context file created")
    })
  program
    .command("sign-hash").description("Sign a transaction hash (blind signing)")
    .argument("<file>", "File to sign")
    .action(async (file: string) => {
      await sign(file, DERIVATION_PATH, true)
      logger.info("Transaction signed")
    })
  program
    .command("sign").description("Sign a transaction (non-blind signing)")
    .argument("<file>", "File to sign")
    .action(async (file: string) => {
      await sign(file, DERIVATION_PATH, false)
      logger.info("Transaction signed")
    })
}

function getAddressInfo(ctx: Context) {
  const [pubX, pubY] = ctx.publicKey!
  const compressedPubKey = compressPublicKey(pubX, pubY).toString('hex')
  logger.info(`P-chain address: ${ctx.pAddressBech32}`)
  logger.info(`C-chain address hex: ${ctx.cAddressHex}`)
  logger.info(`secp256k1 public key: 0x${compressedPubKey}`)
}

async function getBalanceInfo(ctx: Context) {
  let cbalance = (new BN(await ctx.web3.eth.getBalance(ctx.cAddressHex!))).toString()
  let pbalance = (new BN((await ctx.pchain.getBalance(ctx.pAddressBech32!)).balance)).toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  logger.info(`C-chain ${ctx.cAddressHex}: ${cbalance}`)
  logger.info(`P-chain ${ctx.pAddressBech32}: ${pbalance}`)
}

function getNetworkInfo(ctx: Context) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  logger.info(`blockchainId for P-chain: ${pchainId}`)
  logger.info(`blockchainId for C-chain: ${cchainId}`)
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
  const famount: BN = new BN(shiftDecimals(amount, 9))
  const ffee = (fee === undefined) ? fee : new BN(shiftDecimals(fee, 9))
  const { txid, usedFee } = await exportTxCP(ctx, famount, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function exportCP_getHashes(ctx: Context, id: string, amount: string, fee?: string) {
  const famount: BN = new BN(shiftDecimals(amount, 9))
  const ffee = (fee === undefined) ? fee : new BN(shiftDecimals(fee, 9))
  const { usedFee, signatureRequests } = await getUnsignedExportTxCP(ctx, id, famount, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! Transaction with id ${id} constructed`)
}

async function exportCP_useSignatures(ctx: Context, txid: string) {
  const { chainTxId } = await issueSignedEvmTx(ctx, txid)
  logger.info(`Success! TXID: ${chainTxId}`)
}

async function importCP(ctx: Context) {
  const { txid } = await importTxCP(ctx)
  logger.info(`Success! TXID: ${txid}`)
}

async function importCP_getHashes(ctx: Context, id: string) {
  const { signatureRequests } = await getUnsignedImportTxCP(ctx, id)
  logger.info(`Success! Transaction with id ${id} constructed`)
}

async function importCP_useSignatures(ctx: Context, txid: string) {
  const { chainTxId } = await issueSignedPvmTx(ctx, txid)
  logger.info(`Success! TXID: ${chainTxId}`)
}

async function exportPC(ctx: Context, amount?: string) {
  const famount = (amount === undefined) ? amount : new BN(shiftDecimals(amount, 9))
  const { txid } = await exportTxPC(ctx, famount)
  logger.info(`Success! TXID: ${txid}`)
}

async function importPC(ctx: Context, fee?: string) {
  const ffee = (fee === undefined) ? fee : new BN(shiftDecimals(fee, 9))
  const { txid, usedFee } = await importTxPC(ctx, ffee)
  if (fee !== usedFee) logger.info(`Used fee of ${usedFee}`)
  logger.info(`Success! TXID: ${txid}`)
}

async function stake(
  ctx: Context, nodeID: string, amount: string,
  start: string, end: string
) {
  const famount = new BN(shiftDecimals(amount, 9))
  const { txid } = await addValidator(ctx, nodeID, famount, new BN(start), new BN(end))
  logger.info(`Success! TXID: ${txid}`)
}

async function stake_getHashes(
  ctx: Context, id: string, nodeID: string, amount: string,
  start: string, end: string
) {
  const famount = new BN(shiftDecimals(amount, 9))
  const signatureRequests = await getUnsignedAddValidator(ctx, id, nodeID, famount, new BN(start), new BN(end))
  logger.info(`Success! Transaction with id ${id} constructed`)
}

async function stake_useSignatures(ctx: Context, id: string) {
  const { chainTxId } = await issueSignedPvmTx(ctx, id)
  logger.info(`Success! TXID: ${chainTxId}`)
}

async function delegate(
  ctx: Context, nodeID: string, amount: string,
  start: string, end: string
) {
  const famount = new BN(shiftDecimals(amount, 9))
  const { txid } = await addDelegator(ctx, nodeID, famount, new BN(start), new BN(end))
  logger.info(`Success! TXID: ${txid}`)
}

async function delegate_getHashes(
  ctx: Context, id: string, nodeID: string, amount: string,
  start: string, end: string
) {
  const famount = new BN(shiftDecimals(amount, 9))
  const signData = await getUnsignedAddDelegator(ctx, id, nodeID, famount, new BN(start), new BN(end))
  logger.info(`Success! Transaction with id ${id} constructed`)
}

async function delegate_useSignatures(ctx: Context, transaction: string) {
  const { chainTxId } = await issueSignedPvmTx(ctx, transaction)
  logger.info(`Success! TXID: ${chainTxId}`)
}

async function signForDefi(transaction: string, ctx: string) {
  const txid = await sendToForDefi(transaction, ctx)
  logger.info(`Success! ForDefi TXID: ${txid}`)
}

async function fetchForDefiTx(transaction: string) {
  const signature = await getSignature(transaction)
  logger.info(`Success! Signature: ${signature}`)
}