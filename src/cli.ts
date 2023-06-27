import { Command, OptionValues } from 'commander'
import { UnsignedTxJson, SignedTxJson } from './interfaces'
import { compressPublicKey, integerToDecimal, decimalToInteger, readSignedTxJson, saveUnsignedTxJson, toBN } from './utils'
import { contextEnv, contextFile, getContext, Context } from './constants'
import { exportTxCP, importTxPC, issueSignedEvmTx, getUnsignedExportTxCP, getUnsignedImportTxPC } from './evmAtomicTx'
import { exportTxPC, importTxCP, getUnsignedImportTxCP, issueSignedPvmTx, getUnsignedExportTxPC } from './pvmAtomicTx'
import { addValidator, getUnsignedAddValidator } from './addValidator'
import { addDelegator, getUnsignedAddDelegator } from './addDelegator'
import { initContext, DERIVATION_PATH, ledgerGetAccount } from './ledger/key'
import { ledgerSign, signId } from './ledger/sign'
import { getSignature, sendToForDefi } from './forDefi'
import { createWithdrawalTransaction, sendSignedWithdrawalTransaction } from './withdrawal';
import { log, logInfo, logSuccess } from './output'

interface FlareTxParams {
  amount?: string
  fee?: string
  nodeId?: string
  startTime?: string
  endTime?: string
}

export async function cli(program: Command) {
  // global configurations
  program
    .option("--network <network>", "Network name (flare or costwo)", 'flare')
    .option("--env-path <path>", "Path to the .env file")
    .option("--ctx-file <file>", "Context file as returned by ledger commnunication tool", 'ctx.json')
    .option("--get-unsigned-tx", "Create unsigned transaction")
    .option("--send-signed-tx", "Send signed transaction to the network")
    .option("--ledger", "Use ledger to sign transactions")
    .option("--blind", "Blind signing (used for ledger)", false)
  // information about the network
  program
    .command("info").description("Relevant information")
    .argument("<type>", "Type of information")
    .action(async (type: string) => {
      logInfo("Getting information about the network")
      const options = program.opts()
      const ctx = contextFromOptions(options)
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
    .command("transaction").description("Move funds from one chain to another")
    .argument("<type>", "Type of a crosschain transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("-a, --amount <amount>", "Amount to transfer")
    .option("-f, --fee <fee>", "Fee of a transaction")
    .option("-n, --node-id <nodeId>", "The staking/delegating node's id")
    .option("-s, --start-time <start-time>", "Start time of the staking/delegating process")
    .option("-e, --end-time <end-time>", "End time of the staking/delegating process")
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = contextFromOptions(options)
      if (options.getUnsignedTx) {
        await cliBuildUnsignedTxJson(type, ctx, options.transactionId, options as FlareTxParams)
      } else if (options.sendSignedTx) {
        await cliSendSignedTxJson(type, ctx, options.transactionId)
      } else if (options.ledger) {
        await buildAndSendTxUsingLedger(type, options.network, options as FlareTxParams, options.blind)
      } else {
        await cliBuildAndSendTx(type, ctx, options as FlareTxParams)
      }
    })
  // forDefi signing
  program
    .command("forDefi").description("Sign with ForDefi")
    .argument("<type>", "Type of a forDefi transaction")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("--withdrawal", "Withdrawing funds from c-chain")
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      if (type == 'sign') {
        if (options.withdrawal) {
          await signForDefi(options.transactionId, options.ctxFile, true)
        } else {
          await signForDefi(options.transactionId, options.ctxFile)
        }
      } else if (type == 'fetch') {
        if (options.withdrawal) {
          await fetchForDefiTx(options.transactionId, true)
        } else {
          await fetchForDefiTx(options.transactionId)
        }
      }
    })
  // withdrawal from c-chain
  program
  .command("withdrawal").description("Withdraw funds from c-chain")
  .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
  .option("-a, --amount <amount>", "Amount to transfer")
  .option("-to, --to <to>", "Address to send funds to")
  .action(async (options: OptionValues) => {
    options = getOptions(program, options)
    const ctx = contextFromOptions(options)
    if (options.getUnsigned) {
      await withdraw_getHash(ctx, options.to, options.amount, options.transactionId)
    } else if (options.send) {
      await withdraw_useSignature(ctx, options.transactionId)
    }
  })
  // ledger signing
  program
    .command("init-ctx").description("Initialize context file from ledger")
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      await initContext(DERIVATION_PATH, options.network)
      logSuccess("Context file created")
    })
  program
    .command("sign-hash").description("Sign a transaction hash (blind signing)")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      await signId(options.transactionId, DERIVATION_PATH, true)
      logSuccess("Transaction signed")
    })
  program
    .command("sign").description("Sign a transaction (non-blind signing)")
    .option("-id, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      await signId(options.transactionId, DERIVATION_PATH, false)
      logSuccess("Transaction signed")
    })
}

function contextFromOptions(options: OptionValues): Context {
  if (options.useLedger) {
    return getContext(options.network)
  } else if (options.envPath) {
    return contextEnv(options.envPath, options.network)
  } else {
    return contextFile(options.ctxFile)
  }
}

function getOptions(program: Command, options: OptionValues): OptionValues {
  const allOptions: OptionValues = { ...program.opts(), ...options }
  // amount and fee are given in FLR, transform into nanoFLR (FLR = 1e9 nanoFLR)
  if (allOptions.amount) {
    allOptions.amount = decimalToInteger(allOptions.amount, 9)
  }
  if (allOptions.fee) {
    allOptions.fee = decimalToInteger(allOptions.fee, 9)
  }
  return allOptions
}

//////////////////////////////////////////////////////////////////////////////////////////
// transaction-type translators

async function buildAndSendTx(
  transactionType: string, context: Context, params: FlareTxParams
): Promise<{ txid?: string, usedFee?: string }> {
  if (transactionType === 'exportCP') {
    return exportTxCP(context, toBN(params.amount)!, toBN(params.fee))
  } else if (transactionType === 'importCP') {
    return importTxCP(context)
  } else if (transactionType === 'exportPC') {
    return exportTxPC(context, toBN(params.amount))
  } else if (transactionType === 'importPC') {
    return importTxPC(context, toBN(params.fee))
  } else if (transactionType === 'stake') {
    return addValidator(context, params.nodeId!, toBN(params.amount)!, toBN(params.startTime)!, toBN(params.endTime)!)
  } else if (transactionType === 'delegate') {
    return addDelegator(context, params.nodeId!, toBN(params.amount)!, toBN(params.startTime)!, toBN(params.endTime)!)
  } else {
    throw new Error(`Unknown transaction type ${transactionType}`)
  }
}

async function buildUnsignedTxJson(
  transactionType: string, context: Context, params?: FlareTxParams
): Promise<UnsignedTxJson> {
  if (transactionType === 'exportCP') {
    const { amount, fee } = params!
    return getUnsignedExportTxCP(context, toBN(amount)!, toBN(fee))
  } else if (transactionType === 'importCP') {
    return getUnsignedImportTxCP(context)
  } else if (transactionType === 'exportPC') {
    const { amount } = params!
    return getUnsignedExportTxPC(context, toBN(amount)!)
  } else if (transactionType === 'importPC') {
    const { fee } = params!
    return getUnsignedImportTxPC(context, toBN(fee))
  } else if (transactionType === 'stake') {
    const { nodeId, amount, startTime, endTime } = params!
    return getUnsignedAddValidator(context, nodeId!, toBN(amount)!, toBN(startTime)!, toBN(endTime)!)
  } else if (transactionType === 'delegate') {
    const { nodeId, amount, startTime, endTime } = params!
    return getUnsignedAddDelegator(context, nodeId!, toBN(amount)!, toBN(startTime)!, toBN(endTime)!)
  } else {
    throw new Error(`Unknown transaction type: ${transactionType}`)
  }
}

async function sendSignedTxJson(
  transactionType: string, context: Context, signedTxJson: SignedTxJson
): Promise<string> {
  if (transactionType === 'exportCP' || transactionType === 'exportPC') {
    const { chainTxId } = await issueSignedEvmTx(context, signedTxJson)
    return chainTxId
  } else if (
    transactionType === 'importCP' || transactionType === 'importPC' ||
    transactionType === 'stake' || transactionType === 'delegate'
  ) {
    const { chainTxId } = await issueSignedPvmTx(context, signedTxJson)
    return chainTxId
  } else {
    throw new Error(`Unknown transaction type: ${transactionType}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// Network info

function getAddressInfo(ctx: Context) {
  const [pubX, pubY] = ctx.publicKey!
  const compressedPubKey = compressPublicKey(pubX, pubY).toString('hex')
  log(`P-chain address: ${ctx.pAddressBech32}`)
  log(`C-chain address hex: ${ctx.cAddressHex}`)
  log(`secp256k1 public key: 0x${compressedPubKey}`)
}

async function getBalanceInfo(ctx: Context) {
  let cbalance = (toBN(await ctx.web3.eth.getBalance(ctx.cAddressHex!)))!.toString()
  let pbalance = (toBN((await ctx.pchain.getBalance(ctx.pAddressBech32!)).balance))!.toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  log(`C-chain ${ctx.cAddressHex}: ${cbalance}`)
  log(`P-chain ${ctx.pAddressBech32}: ${pbalance}`)
}

function getNetworkInfo(ctx: Context) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  log(`blockchainId for P-chain: ${pchainId}`)
  log(`blockchainId for C-chain: ${cchainId}`)
  log(`assetId: ${ctx.avaxAssetID}`)
}

async function getValidatorInfo(ctx: Context) {
  const pending = await ctx.pchain.getPendingValidators()
  const current = await ctx.pchain.getCurrentValidators()
  const fpending = JSON.stringify(pending, null, 2)
  const fcurrent = JSON.stringify(current, null, 2)
  log(`pending: ${fpending}`)
  log(`current: ${fcurrent}`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using the private key

async function cliBuildAndSendTx(transactionType: string, ctx: Context, params: FlareTxParams) {
  const { txid, usedFee } = await buildAndSendTx(transactionType, ctx, params)
  if (params.fee !== usedFee) log(`Used fee of ${usedFee}`)
  logSuccess(`Success! TXID: ${txid}`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using raw signature signing

async function cliBuildUnsignedTxJson(transactionType: string, ctx: Context, id: string, params: FlareTxParams) {
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, ctx, params)
  saveUnsignedTxJson(unsignedTxJson, id)
  logSuccess(`Transaction with id ${id} constructed`)
}

async function cliSendSignedTxJson(transactionType: string, ctx: Context, id: string) {
  const chainTxId = await sendSignedTxJson(transactionType, ctx, readSignedTxJson(id))
  logSuccess(`TXID: ${chainTxId}`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using ledger device

async function buildAndSendTxUsingLedger(
  transactionType: string, hrp: string, params?: FlareTxParams, blind?: boolean
): Promise<void> {
  logInfo("Fetching account from ledger...")
  const account = await ledgerGetAccount(DERIVATION_PATH, hrp)
  const context = getContext(hrp, account.publicKey)
  logInfo("Creating export transaction...")
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, context, params)
  logInfo("Please review and sign the transaction on your ledger device...")
  const { signature } = await ledgerSign(unsignedTxJson, DERIVATION_PATH, blind)
  const signedTxJson = { ...unsignedTxJson, signature }
  logInfo("Sending transaction to the node...")
  const chainTxId = await sendSignedTxJson(transactionType, context, signedTxJson)
  logSuccess(`Transaction with id ${chainTxId} sent to the node`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using ForDefi api

async function signForDefi(transaction: string, ctx: string, withdrawal: boolean = false) {
  const txid = await sendToForDefi(transaction, ctx, withdrawal);
  logSuccess(`Transaction with id ${txid} sent to the node`)
}

async function fetchForDefiTx(transaction: string, withdrawal: boolean = false) {
  const signature = await getSignature(transaction, withdrawal);
  logSuccess(`Success! Signature: ${signature}`)
}

async function withdraw_getHash(ctx: Context, to: string, amount: number, id: string) {
  const fileId = await createWithdrawalTransaction(ctx, to, amount, id);
  logSuccess(`Transaction with id ${fileId} constructed`)
}

async function withdraw_useSignature(ctx: Context, id: string) {
  const txId = await sendSignedWithdrawalTransaction(ctx, id);
  logSuccess(`Transaction with id ${txId} sent to the node`)
}
