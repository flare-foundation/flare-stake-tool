import { Command, OptionValues } from 'commander'
import { UnsignedTxJson, SignedTxJson, Context, ContextFile, FlareTxParams } from './interfaces'
import { contextEnv, contextFile, getContext, networkFromContextFile } from './constants'
import {
  compressPublicKey, integerToDecimal, decimalToInteger, readSignedTxJson,
  saveUnsignedTxJson, toBN, initCtxJson, publicKeyToEthereumAddressString,
  getUserInput, validatePublicKey, addFlagForSentSignedTx, isAlreadySentToChain
} from './utils'
import { exportTxCP, importTxPC, issueSignedEvmTxPCImport, getUnsignedExportTxCP, getUnsignedImportTxPC, issueSignedEvmTxCPExport } from './transaction/evmAtomicTx'
import { exportTxPC, importTxCP, getUnsignedImportTxCP, issueSignedPvmTx, getUnsignedExportTxPC } from './transaction/pvmAtomicTx'
import { addValidator, getUnsignedAddValidator } from './transaction/addValidator'
import { addDelegator, getUnsignedAddDelegator } from './transaction/addDelegator'
import { ledgerGetAccount } from './ledger/key'
import { ledgerSign, signId } from './ledger/sign'
import { getSignature, sendToForDefi } from './forDefi/forDefi'
import { createWithdrawalTransaction, sendSignedWithdrawalTransaction } from './forDefi/withdrawal'
import { log, logError, logInfo, logSuccess } from './output'
import { colorCodes } from "./constants"
import { fetchMirrorFunds } from "./mirrorFunds/main"
import { submitForDefiTxn } from './flareContract'
import { contractTransactionName } from './flareContractConstants'

const DERIVATION_PATH = "m/44'/60'/0'/0/0" // base derivation path for ledger
const FLR = 1e9 // one FLR in nanoFLR
const MAX_TRANSCTION_FEE = FLR

// mapping from network to symbol
const networkTokenSymbol: { [index: string]: string } = {
  "flare": "FLR",
  "costwo": "C2FLR",
  "localflare": "PHT"
}

export async function cli(program: Command) {
  // global configurations
  program
    .option("--network <network>", "Network name (flare or costwo)")
    .option("--ledger", "Use ledger to sign transactions")
    .option("--blind", "Blind signing (used for ledger)", false)
    .option("--get-hacked", "Use the .env file with the exposed private key")
    .option("--ctx-file <file>", "Context file as returned by init-ctx", 'ctx.json')
    .option("--env-path <path>", "Path to the .env file")
  // interactive mode
  program
    .command("interactive").description("Interactive mode")
    .action(async () => {
      // this will never run, here just for --help display
    })
  // context setup
  program
    .command("init-ctx").description("Initialize context file")
    .option("-p, --public-key <public-key>", "Public key of the account")
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      initCtxJsonFromOptions(options)
    })
  // information about the network
  program
    .command("info").description("Relevant information")
    .argument("<addresses|balance|network|validators>", "Type of information")
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
      } else if (type == 'mirror'){
        await logMirrorFundInfo(ctx)
      } else {
        logError(`Unknown information type ${type}`)
      }
    })
  // transaction construction and sending
  program
    .command("transaction").description("Move funds from one chain to another, stake, and delegate")
    .argument("<importCP|exportCP|importPC|exportPC|delegate|stake>", "Type of a crosschain transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("-a, --amount <amount>", "Amount to transfer")
    .option("-f, --fee <fee>", "Transaction fee")
    .option("-n, --node-id <nodeId>", "The id of the node to stake/delegate to")
    .option("-s, --start-time <start-time>", "Start time of the staking/delegating process")
    .option("-e, --end-time <end-time>", "End time of the staking/delegating process")
    .option("--derivation-path <derivation-path>", "Derivation Path of the address that needs to be used", DERIVATION_PATH)
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .option("--delegation-fee <delegation-fee>", "Delegation fee defined by the deployed validator", "10")
    .option("--threshold <threshold>", "Threshold of the constructed transaction", "1")
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options, options.derivationPath)
      if (options.getHacked) {
        // this is more of a concept for future development, by now private key was already exposed to dependencies
        const response = await getUserInput(`${colorCodes.redColor}Warning: You are about to expose your private key to 800+ dependencies, and we cannot guarantee one of them is not malicious! \nThis command is not meant to be used in production, but for testing only!${colorCodes.resetColor} \nProceed? (Y/N) `)
        if (response == 'Y' || response == 'y') {
          await cliBuildAndSendTxUsingPrivateKey(type, ctx, options as FlareTxParams)
        }
      } else if (options.ledger) {
        await cliBuildAndSendTxUsingLedger(type, ctx, options as FlareTxParams, options.blind, options.derivationPath)
      } else {
        await cliBuildUnsignedTxJson(type, ctx, options.transactionId, options as FlareTxParams)
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
    .argument("<sign|fetch>", "Type of a forDefi transaction")
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
    .option("--send-signed-tx", "Send signed transaction json to the node")
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      if (options.sendSignedTx) {
        await withdraw_useSignature(ctx, options.transactionId)
      } else { // create unsigned transaction
        await withdraw_getHash(ctx, options.to, options.amount, options.transactionId, options.nonce)
      }
    })
}

/**
 * @description - returns context from the options that are passed
 * @param options - option to define whether its from ledger/env/ctx.file
 * @returns Returns the context based the source passed in the options
 */
export async function contextFromOptions(options: OptionValues, derivationPath: string = DERIVATION_PATH): Promise<Context> {
  if (options.ledger) {
    logInfo("Fetching account from ledger...")
    const account = await ledgerGetAccount(derivationPath, options.network)
    const context = getContext(options.network, account.publicKey)
    return context
  } else if (options.envPath) {
    return contextEnv(options.envPath, options.network)
  } else {
    return contextFile(options.ctxFile)
  }
}

// Network is obtained from context file, if it exists, else from --network flag.
// This is because ledger does not need a context file
/**
 * @description Returns the network config from the options that were passed
 * @param options - contains the options to derive the network
 * @returns - network
 */
export function networkFromOptions(options: OptionValues): string {
  let network = options.network
  if (network == undefined) {
    try {
      network = networkFromContextFile(options.ctxFile)
    } catch (e) {
      network = "flare"
    }
  }
  logInfo(`Using network: ${network}`)
  return network
}

/**
 * @description - Returns the options for a command
 * @param program - the command
 * @param options - option available for the command
 */
export function getOptions(program: Command, options: OptionValues): OptionValues {
  const allOptions: OptionValues = { ...program.opts(), ...options }
  const network = networkFromOptions(allOptions)
  // amount and fee are given in FLR, transform into nanoFLR (FLR = 1e9 nanoFLR)
  if (allOptions.amount) {
    allOptions.amount = decimalToInteger(allOptions.amount.replace(/,/g, ''), 9)
  }
  if (allOptions.fee) {
    allOptions.fee = decimalToInteger(allOptions.fee, 9)
  }
  return { ...allOptions, network }
}
/**
 * @description - Returms the fee getting used
 * @param cap - the max allowed free
 * @param usedFee - fee that was used
 * @param specifiedFee - fee specified by the user
 */
export function capFeeAt(cap: number, network: string, usedFee?: string, specifiedFee?: string): void {
  if (usedFee !== specifiedFee) { // if usedFee was that specified by the user, we don't cap it
    const usedFeeNumber = Number(usedFee) // if one of the fees is defined, usedFee is defined
    const symbol = networkTokenSymbol[network]
    if (usedFeeNumber > cap)
      throw new Error(`Used fee of ${usedFeeNumber / FLR} ${symbol} is higher than the maximum allowed fee of ${cap / FLR} ${symbol}`)
    logInfo(`Using fee of ${usedFeeNumber / FLR} ${symbol}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// transaction-type translators

function buildUnsignedTxJson(
  transactionType: string, context: Context, params: FlareTxParams
): Promise<UnsignedTxJson> {
  switch (transactionType) {
    case 'exportCP': {
      return getUnsignedExportTxCP(context, toBN(params.amount)!, toBN(params.fee),
        (params.nonce === undefined) ? undefined : Number(params.nonce))
    }
    case 'importCP':
      return getUnsignedImportTxCP(context, Number(params.threshold!))
    case 'exportPC': {
      return getUnsignedExportTxPC(context, toBN(params.amount)!, Number(params.threshold!))
    }
    case 'importPC': {
      return getUnsignedImportTxPC(context, toBN(params.fee))
    }
    case 'stake': {
      return getUnsignedAddValidator(context, params.nodeId!, toBN(params.amount)!, toBN(params.startTime)!,
        toBN(params.endTime)!, Number(params.delegationFee!), Number(params.threshold!))
    }
    case 'delegate': {
      return getUnsignedAddDelegator(context, params.nodeId!, toBN(params.amount)!,
        toBN(params.startTime)!, toBN(params.endTime)!, Number(params.threshold!))
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
    return importTxCP(context, Number(params.threshold!))
  } else if (transactionType === 'exportPC') {
    return exportTxPC(context, toBN(params.amount), Number(params.threshold!))
  } else if (transactionType === 'importPC') {
    return importTxPC(context, toBN(params.fee))
  } else if (transactionType === 'stake') {
    return addValidator(context, params.nodeId!, toBN(params.amount)!, toBN(params.startTime)!,
      toBN(params.endTime)!, Number(params.delegationFee!), Number(params.threshold!))
  } else if (transactionType === 'delegate') {
    return addDelegator(context, params.nodeId!, toBN(params.amount)!,
      toBN(params.startTime)!, toBN(params.endTime)!, Number(params.threshold!))
  } else {
    throw new Error(`Unknown transaction type ${transactionType}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// initializing ctx.json

export async function initCtxJsonFromOptions(options: OptionValues, derivationPath = DERIVATION_PATH): Promise<void> {
  let contextFile: ContextFile
  if (options.ledger) {
    const { publicKey, address } = await ledgerGetAccount(derivationPath, options.network)
    const ethAddress = publicKeyToEthereumAddressString(publicKey)
    contextFile = { publicKey, ethAddress, flareAddress: address, network: options.network, derivationPath }
  } else if (options.publicKey) {
    if (!validatePublicKey(options.publicKey)) return logError('Invalid public key')
    contextFile = { publicKey: options.publicKey, network: options.network }
    if (options.vaultId) {
      contextFile = {
        ...contextFile,
        vaultId: options.vaultId
      }
    }
  } else {
    throw new Error('Either --ledger or --public-key must be specified')
  }
  initCtxJson(contextFile)
  logSuccess("Context file created")
}

//////////////////////////////////////////////////////////////////////////////////////////
// Network info
/**
 * @description Logs the address info
 * @param ctx - the context file aka ctx.json
 * @returns Returns the address info
 */
export function logAddressInfo(ctx: Context) {
  const [pubX, pubY] = ctx.publicKey!
  const compressedPubKey = compressPublicKey(pubX, pubY).toString('hex')
  logInfo(`Addresses on the network "${ctx.config.hrp}"`)
  log(`P-chain address: ${ctx.pAddressBech32}`)
  log(`C-chain address hex: ${ctx.cAddressHex}`)
  log(`secp256k1 public key: 0x${compressedPubKey}`)
}

/**
 * @description Logs the balance info of the account
 * @param ctx - the context file aka ctx.json
 */
export async function logBalanceInfo(ctx: Context) {
  let cbalance = (toBN(await ctx.web3.eth.getBalance(ctx.cAddressHex!)))!.toString()
  let pbalance = (toBN((await ctx.pchain.getBalance(ctx.pAddressBech32!)).balance))!.toString()
  cbalance = integerToDecimal(cbalance, 18)
  pbalance = integerToDecimal(pbalance, 9)
  const symbol = networkTokenSymbol[ctx.config.hrp]
  logInfo(`Balances on the network "${ctx.config.hrp}"`)
  log(`C-chain ${ctx.cAddressHex}: ${cbalance} ${symbol}`)
  log(`P-chain ${ctx.pAddressBech32}: ${pbalance} ${symbol}`)
}

/**
 * @description Logs info aboout P,C and asset id
 * @param ctx - the context file
 */
export function logNetworkInfo(ctx: Context) {
  const pchainId = ctx.pchain.getBlockchainID()
  const cchainId = ctx.cchain.getBlockchainID()
  logInfo(`Information about the network "${ctx.config.hrp}"`)
  log(`blockchainId for P-chain: ${pchainId}`)
  log(`blockchainId for C-chain: ${cchainId}`)
  log(`assetId: ${ctx.avaxAssetID}`)
}

/**
 * @description Logs the validator information regrading current and pending validators
 * @param ctx - the context file
 */
export async function logValidatorInfo(ctx: Context) {
  const pending = await ctx.pchain.getPendingValidators()
  const current = await ctx.pchain.getCurrentValidators()
  const fpending = JSON.stringify(pending, null, 2)
  const fcurrent = JSON.stringify(current, null, 2)
  logInfo(`Validators on the network "${ctx.config.hrp}"`)
  log(`pending: ${fpending}`)
  log(`current: ${fcurrent}`)
}

/**
 * @description Logs mirror fund details
 * @param ctx - context
 */
export async function logMirrorFundInfo(ctx: Context) {
  const mirroFundDetails  = await fetchMirrorFunds(ctx)
  logInfo(`Mirror fund details on the network "${ctx.config.hrp}"`)
  log(`${JSON.stringify(mirroFundDetails, null, 2)}`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction building and execution

async function cliBuildAndSendTxUsingLedger(transactionType: string, context: Context, params: FlareTxParams, blind: boolean, derivationPath: string
): Promise<void> {
  logInfo("Creating export transaction...")
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, context, params)
  capFeeAt(MAX_TRANSCTION_FEE, context.config.hrp, unsignedTxJson.usedFee, params.fee)
  logInfo("Please review and sign the transaction on your ledger device...")
  const { signature } = await ledgerSign(unsignedTxJson, derivationPath, blind)
  const signedTxJson = { ...unsignedTxJson, signature }
  logInfo("Sending transaction to the node...")
  const chainTxId = await sendSignedTxJson(context, signedTxJson)
  logSuccess(`Transaction with id ${chainTxId} sent to the node`)
}

async function cliBuildUnsignedTxJson(transactionType: string, context: Context, id: string, params: FlareTxParams) {
  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(transactionType, context, params)
  capFeeAt(MAX_TRANSCTION_FEE, context.config.hrp, unsignedTxJson.usedFee, params.fee)
  saveUnsignedTxJson(unsignedTxJson, id)
  logSuccess(`Unsigned transaction with hash ${id} constructed`)
}

async function cliSendSignedTxJson(ctx: Context, id: string) {
  if (isAlreadySentToChain(id)) {
    throw new Error("Tx already sent to chain")
  }
  const signedTxnJson = readSignedTxJson(id)
  let chainTxId
  if (signedTxnJson.transactionType === contractTransactionName) {
    chainTxId = await submitForDefiTxn(id, signedTxnJson.signature, ctx.config.hrp)
  } else {
    chainTxId = await sendSignedTxJson(ctx, signedTxnJson)
  }
  addFlagForSentSignedTx(id)
  logSuccess(`Signed transaction ${id} with hash ${chainTxId} sent to the node`)
}

async function cliBuildAndSendTxUsingPrivateKey(transactionType: string, ctx: Context, params: FlareTxParams) {
  const { txid, usedFee } = await buildAndSendTxUsingPrivateKey(transactionType, ctx, params)
  const symbol = networkTokenSymbol[ctx.config.hrp]
  if (usedFee) logInfo(`Used fee of ${integerToDecimal(usedFee, 9)} ${symbol}`)
  logSuccess(`Transaction with hash ${txid} built and sent to the network`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction execution using ForDefi api

async function signForDefi(transaction: string, ctx: string, withdrawal: boolean = false) {
  const txid = await sendToForDefi(transaction, ctx, withdrawal)
  logSuccess(`Transaction with hash ${txid} sent to the node`)
}

async function fetchForDefiTx(transaction: string, withdrawal: boolean = false) {
  if (isAlreadySentToChain(transaction)) {
    throw new Error("Tx already sent to chain")
  }
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