import { Command, OptionValues } from 'commander'
import { UnsignedTxJson, SignedTxJson, Context, ContextFile, FlareTxParams } from './interfaces'
import { contextEnv, contextFile, getContext } from './constants'
import { compressPublicKey, integerToDecimal, decimalToInteger, readSignedTxJson, saveUnsignedTxJson, toBN, initCtxJson, publicKeyToEthereumAddressString } from './utils'
import { exportTxCP, importTxPC, issueSignedEvmTxPCImport, getUnsignedExportTxCP, getUnsignedImportTxPC, issueSignedEvmTxCPExport } from './evmAtomicTx'
import { exportTxPC, importTxCP, getUnsignedImportTxCP, issueSignedPvmTx, getUnsignedExportTxPC } from './pvmAtomicTx'
import { addValidator, getUnsignedAddValidator } from './addValidator'
import { addDelegator, getUnsignedAddDelegator } from './addDelegator'
import { ledgerGetAccount } from './ledger/key'
import { ledgerSign, signId } from './ledger/sign'
import { getSignature, sendToForDefi } from './forDefi'
import { createWithdrawalTransaction, sendSignedWithdrawalTransaction } from './withdrawal'
import { log, logError, logInfo, logSuccess } from './output'

const DERIVATION_PATH = "m/44'/60'/0'/0/0" // derivation path for ledger
const FLR = 1e9 // one FLR in nanoFLR
const MAX_TRANSCTION_FEE = FLR

export async function cli(program: Command) {
  // global configurations
  program
    .option("--network <network>", "Network name (flare or costwo)", 'flare')
    .option("--env-path <path>", "Path to the .env file")
    .option("--ctx-file <file>", "Context file as returned by init-ctx", 'ctx.json')
    .option("--ledger", "Use ledger to sign transactions")
  // context setup
  program
    .command("init-ctx").description("Initialize context file")
    .option("-p, --public-key <public-key>", "Public key of the account")
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      initCtxJsonFromOptions(options)
      logSuccess("Context file created")
    })
  // information about the network
  program
    .command("info").description("Relevant information")
    .argument("<type>", "Type of information")
    .action(async (type: string) => {
      const options = getOptions(program, program.opts())
      const ctx = await contextFromOptions(options)
      if (type == 'addresses') {
        logAddressInfo(ctx)
      } else if (type == 'balance') {
        await logBalanceInfo(ctx)
      } else if (type == 'network') {
        logNetworkInfo(ctx)
      } else if (type == 'validators') {
        await logValidatorInfo(ctx)
      } else {
        logError(`Unknown information type ${type}`)
      }
    })
  // transaction construction and sending
  program
    .command("transaction").description("Move funds from one chain to another")
    .argument("<type>", "Type of a crosschain transaction")
    .option("--get-unsigned-tx", "Create unsigned transaction")
    .option("--blind", "Blind signing (used for ledger)", false)
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("-a, --amount <amount>", "Amount to transfer")
    .option("-f, --fee <fee>", "Transaction fee")
    .option("-n, --node-id <nodeId>", "The id of the node to stake/delegate to")
    .option("-s, --start-time <start-time>", "Start time of the staking/delegating process")
    .option("-e, --end-time <end-time>", "End time of the staking/delegating process")
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      if (options.getUnsignedTx) {
        await cliBuildUnsignedTxJson(type, ctx, options.transactionId, options as FlareTxParams)
      } else if (options.ledger) {
        await cliBuildAndSendTxUsingLedger(type, ctx, options as FlareTxParams, options.blind)
      } else {
        await cliBuildAndSendTxUsingPrivateKey(type, ctx, options as FlareTxParams)
      }
    })
  // signed transaction sending
  program
    .command("send").description("Send signed transaction json to the node")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to send to the network")
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await cliSendSignedTxJson(ctx, options.transactionId)
    })
  // forDefi signing
  program
    .command("forDefi").description("Sign with ForDefi")
    .argument("<type>", "Type of a forDefi transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
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
  .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
  .option("-a, --amount <amount>", "Amount to transfer")
  .option("-t, --to <to>", "Address to send funds to")
  .option("--nonce <nonce>", "Nonce of the constructed transaction")
  .option("--get-unsigned-tx", "Create unsigned transaction")
  .option("--send-signed-tx", "Send signed transaction json to the node")
  .action(async (options: OptionValues) => {
    options = getOptions(program, options)
    const ctx = await contextFromOptions(options)
    if (options.getUnsignedTx) {
      await withdraw_getHash(ctx, options.to, options.amount, options.transactionId, options.nonce)
    } else if (options.sendSignedTx) {
      await withdraw_useSignature(ctx, options.transactionId)
    }
  })
  // ledger signing
  program
    .command("sign-hash").description("Sign a transaction hash (blind signing)")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      await signId(options.transactionId, DERIVATION_PATH, true)
      logSuccess("Transaction signed")
    })
  program
    .command("sign").description("Sign a transaction (non-blind signing)")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .action(async (options: OptionValues) => {
      await signId(options.transactionId, DERIVATION_PATH, false)
      logSuccess("Transaction signed")
    })
}

async function contextFromOptions(options: OptionValues): Promise<Context> {
  if (options.ledger) {
    logInfo("Fetching account from ledger...")
    const account = await ledgerGetAccount(DERIVATION_PATH, options.network)
    const context = getContext(options.network, account.publicKey)
    return context
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
    allOptions.amount = decimalToInteger(allOptions.amount.replace(/,/g, ''), 9)
  }
  if (allOptions.fee) {
    allOptions.fee = decimalToInteger(allOptions.fee, 9)
  }
  return allOptions
}

function capFeeAt(cap: number, usedFee?: string, specifiedFee?: string): void {
  if (usedFee !== specifiedFee) { // if usedFee was that specified by the user, we don't cap it
    const usedFeeNumber = toBN(usedFee)!.toNumber() // if one of the fees is defined, usedFee is defined
    if (usedFeeNumber > cap)
     throw new Error(`Used fee of ${usedFeeNumber / FLR} is higher than the maximum allowed fee of ${cap / FLR}`)
    logInfo(`Using fee of ${usedFeeNumber / FLR}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// transaction-type translators

function buildUnsignedTxJson(
  transactionType: string, context: Context, params: FlareTxParams
): Promise<UnsignedTxJson> {
  switch (transactionType) {
    case 'exportCP': {
      const { amount, fee, nonce } = params!
      return getUnsignedExportTxCP(context, toBN(amount)!, toBN(fee), toBN(nonce))
    }
    case 'importCP':
      return getUnsignedImportTxCP(context)
    case 'exportPC': {
      const { amount } = params!
      return getUnsignedExportTxPC(context, toBN(amount)!)
    }
    case 'importPC': {
      const { fee } = params!
      return getUnsignedImportTxPC(context, toBN(fee))
    }
    case 'stake': {
      const { nodeId, amount, startTime, endTime } = params
      return getUnsignedAddValidator(context, nodeId!, toBN(amount)!, toBN(startTime)!, toBN(endTime)!)
    }
    case 'delegate': {
      const { nodeId, amount, startTime, endTime } = params
      return getUnsignedAddDelegator(context, nodeId!, toBN(amount)!, toBN(startTime)!, toBN(endTime)!)
    }
    default:
      throw new Error(`Unknown transaction type: ${transactionType}`)
  }
}

async function sendSignedTxJson(
  context: Context, signedTxJson: SignedTxJson
): Promise<string> {
  switch (signedTxJson.transactionType) {
    case 'exportCP': {
      const { chainTxId } = await issueSignedEvmTxCPExport(context, signedTxJson)
      return chainTxId
    }
    case 'importPC': {
      const { chainTxId } = await issueSignedEvmTxPCImport(context, signedTxJson)
      return chainTxId
    }
    case 'exportPC':
    case 'importCP':
    case 'stake':
    case 'delegate': {
      const { chainTxId } = await issueSignedPvmTx(context, signedTxJson)
      return chainTxId
    }
    default:
      throw new Error(`Unknown transaction type: ${signedTxJson.transactionType}`)
  }
}

async function buildAndSendTxUsingPrivateKey(
  transactionType: string, context: Context, params: FlareTxParams
): Promise<{ txid: string, usedFee?: string }> {
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

//////////////////////////////////////////////////////////////////////////////////////////
// initializing ctx.json

export async function initCtxJsonFromOptions(options: OptionValues) {
  let contextFile: ContextFile
  if (options.ledger) {
    const { publicKey, address } = await ledgerGetAccount(DERIVATION_PATH, options.network)
    const ethAddress = publicKeyToEthereumAddressString(publicKey)
    contextFile = { publicKey, ethAddress, flareAddress: address, network: options.network }
  } else if (options.publicKey) {
    contextFile = { publicKey: options.publicKey, network: options.network }
  } else {
    throw new Error('Either --ledger or --public-key must be specified')
  }
  initCtxJson(contextFile)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Network info

function logAddressInfo(ctx: Context) {
  const [pubX, pubY] = ctx.publicKey!
  const compressedPubKey = compressPublicKey(pubX, pubY).toString('hex')
  logInfo(`Addresses on the network "${ctx.config.hrp}"`)
  log(`P-chain address: ${ctx.pAddressBech32}`)
  log(`C-chain address hex: ${ctx.cAddressHex}`)
  log(`secp256k1 public key: 0x${compressedPubKey}`)
}

async function logBalanceInfo(ctx: Context) {
  let cbalance = (toBN(await ctx.web3.eth.getBalance(ctx.cAddressHex!)))!.toString()
  let pbalance = (toBN((await ctx.pchain.getBalance(ctx.pAddressBech32!)).balance))!.toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  logInfo(`Balances on the network "${ctx.config.hrp}"`)
  log(`C-chain ${ctx.cAddressHex}: ${cbalance}`)
  log(`P-chain ${ctx.pAddressBech32}: ${pbalance}`)
}

function logNetworkInfo(ctx: Context) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  logInfo(`Information about the network "${ctx.config.hrp}"`)
  log(`blockchainId for P-chain: ${pchainId}`)
  log(`blockchainId for C-chain: ${cchainId}`)
  log(`assetId: ${ctx.avaxAssetID}`)
}

async function logValidatorInfo(ctx: Context) {
  const pending = await ctx.pchain.getPendingValidators()
  const current = await ctx.pchain.getCurrentValidators()
  const fpending = JSON.stringify(pending, null, 2)
  const fcurrent = JSON.stringify(current, null, 2)
  logInfo(`Validators on the network "${ctx.config.hrp}"`)
  log(`pending: ${fpending}`)
  log(`current: ${fcurrent}`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction building and execution

async function cliBuildAndSendTxUsingLedger(transactionType: string, context: Context, params: FlareTxParams, blind: boolean
): Promise<void> {
  logInfo("Creating export transaction...")
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, context, params)
  capFeeAt(MAX_TRANSCTION_FEE, unsignedTxJson.usedFee, params.fee)
  logInfo("Please review and sign the transaction on your ledger device...")
  const { signature } = await ledgerSign(unsignedTxJson, DERIVATION_PATH, blind)
  const signedTxJson = { ...unsignedTxJson, signature }
  logInfo("Sending transaction to the node...")
  const chainTxId = await sendSignedTxJson(context, signedTxJson)
  logSuccess(`Transaction with id ${chainTxId} sent to the node`)
}

async function cliBuildUnsignedTxJson(transactionType: string, ctx: Context, id: string, params: FlareTxParams) {
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, ctx, params)
  capFeeAt(MAX_TRANSCTION_FEE, unsignedTxJson.usedFee, params.fee)
  saveUnsignedTxJson(unsignedTxJson, id)
  logSuccess(`Unsigned transaction with id ${id} constructed`)
}

async function cliSendSignedTxJson(ctx: Context, id: string) {
  const chainTxId = await sendSignedTxJson(ctx, readSignedTxJson(id))
  logSuccess(`Signed transaction ${id} with id ${chainTxId} sent to the node`)
}

async function cliBuildAndSendTxUsingPrivateKey(transactionType: string, ctx: Context, params: FlareTxParams) {
  const { txid, usedFee } = await buildAndSendTxUsingPrivateKey(transactionType, ctx, params)
  capFeeAt(MAX_TRANSCTION_FEE, usedFee, params.fee)
  logSuccess(`Transaction with id ${txid} built and sent to the network`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using ForDefi api

async function signForDefi(transaction: string, ctx: string, withdrawal: boolean = false) {
  const txid = await sendToForDefi(transaction, ctx, withdrawal)
  logSuccess(`Transaction with id ${txid} sent to the node`)
}

async function fetchForDefiTx(transaction: string, withdrawal: boolean = false) {
  const signature = await getSignature(transaction, withdrawal)
  logSuccess(`Success! Signature: ${signature}`)
}

async function withdraw_getHash(ctx: Context, to: string, amount: number, id: string, nonce: number) {
  const fileId = await createWithdrawalTransaction(ctx, to, amount, id, nonce)
  logSuccess(`Transaction with id ${fileId} constructed`)
}

async function withdraw_useSignature(ctx: Context, id: string) {
  const txId = await sendSignedWithdrawalTransaction(ctx, id)
  logSuccess(`Transaction with id ${txId} sent to the node`)
}
