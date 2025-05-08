import { Command, OptionValues } from 'commander'
import {
  ExportPTxParams,
  ImportCTxParams,
  ImportPTxParams,
  ExportCTxParams,
  TxDetails,
  TxSummary,
  ValidatorPTxParams,
  DelegatorPTxParams
} from './flare/interfaces'
import {
  pvm,
  evm,
  utils as futils,
  TransferableOutput,
  Context as FContext,
  UnsignedTx,
  messageHashFromUnsignedTx,
  networkIDs
} from '@flarenetwork/flarejs'
import { Context, ContextFile, FlareTxParams, SignedTxJson, UnsignedTxJson } from './interfaces'
import { contextEnv, contextFile, getContext, networkFromContextFile } from './context'
import {
  compressPublicKey,
  integerToDecimal,
  decimalToInteger,
  toBN,
  initCtxJson,
  publicKeyToEthereumAddressString,
  validatePublicKey,
  saveUnsignedTxJson,
  isAlreadySentToChain,
  addFlagForSentSignedTx,
  readSignedTxJson
} from './utils'
import { createOptOutTransaction, createWithdrawalTransaction, sendSignedEvmTransaction } from './forDefi/evmTx'
import { log, logError, logInfo, logSuccess } from './output'
import * as ledger from './ledger'
import * as flare from './flare'
import * as settings from './settings'
import { StakeParams } from './ui/interfaces'
import { getPBalance } from './flare/chain'
import { JsonRpcProvider } from 'ethers'
import { BN } from 'bn.js'
import { addDelegator, addValidator, exportCP, exportPC, importCP, importPC } from './transaction'
import { getSignature, sendToForDefi } from './forDefi/transaction'
import { fetchMirrorFunds } from './contracts'

const BASE_DERIVATION_PATH = "m/44'/60'/0'/0/0" // base derivation path for ledger
const FLR = 1e9 // one FLR in nanoFLR

// mapping from network to symbol
const networkTokenSymbol: { [index: string]: string } = {
  flare: 'FLR',
  songbird: 'SGB',
  costwo: 'C2FLR',
  coston: 'CFLR',
  localflare: 'PHT'
}

export async function cli(program: Command) {
  // global configurations
  program
    .option('--network <network>', 'Network name (flare|songbird|costwo|coston|localflare)')
    .option('--ledger', 'Use ledger to sign transactions')
    .option('--blind', 'Blind signing (used for ledger)', true)
    .option(
      '--derivation-path <derivation-path>',
      'Ledger address derivation path',
      BASE_DERIVATION_PATH
    )
    .option('--ctx-file <file>', 'Context file as returned by init-ctx', 'ctx.json')
    .option('--env-path <path>', 'Path to the .env file')
    .option('--get-hacked', 'Use the .env file with the exposed private key')
  // interactive mode
  program
    .command('interactive')
    .description('Interactive mode')
    .action(async () => {
      // this will never run, here just for --help display
    })
  // context setup
  program
    .command('init-ctx')
    .description('Initialize context file')
    .option('-p, --public-key <public-key>', 'Public key of the account')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      initCtxJsonFromOptions(options)
    })
  // information about the network
  program
    .command('info')
    .description('Relevant information')
    .argument('<addresses|balance|network|validators>', 'Type of information')
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
      } else if (type == 'mirror') {
        await logMirrorFundInfo(ctx)
      } else {
        logError(`Unknown information type ${type}`)
      }
    })
  // transaction construction and sending
  program
    .command('transaction')
    .description('Move funds from one chain to another, stake, and delegate')
    .argument(
      '<importCP|exportCP|importPC|exportPC|delegate|stake>',
      'Type of a cross chain transaction'
    )
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('-a, --amount <amount>', 'Amount to transfer')
    .option('-f, --fee <fee>', 'Transaction fee (in FLR)')
    .option('-n, --node-id <nodeId>', 'The id of the node to stake/delegate to')
    .option('-s, --start-time <start-time>', 'Start time of the staking/delegating process')
    .option('-e, --end-time <end-time>', 'End time of the staking/delegating process')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .option(
      '--delegation-fee <delegation-fee>',
      'Delegation fee defined by the deployed validator',
      '10'
    )
    .option('--pop-bls-public-key <popBlsPublicKey>', 'BLS Public Key')
    .option('--pop-bls-signature <popBlsSignature>', 'BLS Signature')
    .option('--threshold <threshold>', 'Threshold of the constructed transaction', '1')
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      if (options.getHacked) {
        // for future development: users should get notified before the program gets access to their private keys
        await cliBuildAndSendTxUsingPrivateKey(type, ctx, options as FlareTxParams)
      } else if (options.ledger) {
        await cliBuildAndSendTxUsingLedger(
          type,
          ctx,
          options as FlareTxParams,
          options.blind,
          options.derivationPath
        )
      } else {
        await cliBuildAndSaveUnsignedTxJson(
          type,
          ctx,
          options.transactionId,
          options as FlareTxParams,
        );
      }
    })
  // signed transaction sending
  program
    .command("send")
    .description("Send signed transaction json to the node")
    .option(
      "-i, --transaction-id <transaction-id>",
      "Id of the transaction to send to the network",
    )
    .action(async (options: OptionValues) => {
      options = getOptions(program, options);
      const ctx = await contextFromOptions(options);
      await cliSendSignedTxJson(ctx, options.transactionId);
    });
  // forDefi signing
  program
    .command("forDefi")
    .description("Sign with ForDefi")
    .argument("<sign|fetch>", "Type of a forDefi transaction")
    .option(
      "-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("--evm-tx", "Regular EVM transaction")
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options);
      if (type == "sign") {
        if (options.evmTx) {
          await signForDefi(options.transactionId, options.ctxFile, true);
        } else {
          await signForDefi(options.transactionId, options.ctxFile);
        }
      } else if (type == "fetch") {
        if (options.evmTx) {
          await fetchForDefiTx(options.transactionId, true);
        } else {
          await fetchForDefiTx(options.transactionId);
        }
      }
    });
  // withdrawal (transfer) from c-chain
  program
    .command('withdrawal')
    .description('Withdraw funds from c-chain')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('-a, --amount <amount>', 'Amount to transfer')
    .option('-t, --to <to>', 'Address to send funds to')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
        await buildUnsignedWithdrawalTxJson(
          ctx,
          options.to,
          options.amount,
          options.transactionId,
          options.nonce
        )
    })
  // opt out
  program
  .command("optOut").description("Opt out of rewards on the c-chain")
  .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
  .option("--nonce <nonce>", "Nonce of the constructed transaction")
  .action(async (options: OptionValues) => {
    options = getOptions(program, options)
    const ctx = await contextFromOptions(options)
    await buildUnsignedOptOutTxJson(ctx, options.to, options.amount, options.transactionId, options.nonce)
  })
}

/**
 * @description - returns context from the options that are passed
 * @param options - option to define whether its from ledger/env/ctx.file
 * @returns Returns the context based the source passed in the options
 */
export async function contextFromOptions(options: OptionValues): Promise<Context> {
  if (options.ledger) {
    logInfo('Fetching account from ledger...')
    const publicKey = await ledger.getPublicKey(options.derivationPath, options.network)
    const ctx = getContext(options.network, publicKey)
    return ctx
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
      network = networkFromContextFile(options.ctxFile);
      // TODO:
    } catch (e) {
      network = 'flare'
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


//////////////////////////////////////////////////////////////////////////////////////////
// transaction-type translators

async function buildUnsignedTx(
  transactionType: string,
  ctx: Context,
  params: FlareTxParams
): Promise<UnsignedTx> {
  const provider = new JsonRpcProvider(settings.URL[ctx.config.hrp] + '/ext/bc/C/rpc')
  const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const txCount = await provider.getTransactionCount(ctx.cAddressHex!)
  function getChainIdFromContext(sourceChain: 'X' | 'P' | 'C', context: FContext.Context) {
    return sourceChain === 'C'
      ? context.cBlockchainID
      : sourceChain === 'P'
        ? context.pBlockchainID
        : context.xBlockchainID
  }

  switch (transactionType) {
    case 'exportCP': {
      if (!params.fee) {
        throw new Error(
          `fee is required for exportCP transaction. Use --fee <fee> to specify the fee`
        )
      }
      const nonce = params.nonce ?? txCount
      const exportTx = evm.newExportTx(
        context,
        BigInt(params.amount!),
        context.pBlockchainID,
        futils.hexToBuffer(ctx.cAddressHex!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        BigInt(params.fee!),
        BigInt(nonce)
      )
      return exportTx
    }
    case 'importCP': {
      const { utxos } = await pvmapi.getUTXOs({
        sourceChain: 'C',
        addresses: [ctx.pAddressBech32!]
      })

      const importTx = pvm.newImportTx(
        context,
        getChainIdFromContext('C', context),
        utxos,
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        [futils.bech32ToBytes(ctx.cAddressBech32!)]
      )
      return importTx
    }
    case 'exportPC': {
      const { utxos } = await pvmapi.getUTXOs({
        addresses: [ctx.pAddressBech32!]
      })

      const exportTx = pvm.newExportTx(
        context,
        getChainIdFromContext('C', context),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        utxos,
        [
          TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount!), [
            futils.bech32ToBytes(ctx.pAddressBech32!)
          ])
        ]
      )
      return exportTx
    }
    case 'importPC': {
      if (!params.fee) {
        throw new Error(
          `fee is required for importPC transaction. Use --fee <fee> to specify the fee`
        )
      }
      const { utxos } = await evmapi.getUTXOs({
        sourceChain: 'P',
        addresses: [ctx.cAddressBech32!]
      })

      const exportTx = evm.newImportTx(
        context,
        futils.hexToBuffer(ctx.cAddressHex!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        utxos,
        getChainIdFromContext('P', context),
        BigInt(params.fee!)
      )
      return exportTx
    }
    case 'stake': {
      const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32!] })
      const start = BigInt(params.startTime!)
      const end = BigInt(params.endTime!)
      const nodeID = params.nodeId!
      const blsPublicKey = futils.hexToBuffer(params.popBlsPublicKey!)
      const blsSignature = futils.hexToBuffer(params.popBlsSignature!)

      const stakeTx = pvm.newAddPermissionlessValidatorTx(
        context,
        utxos,
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        nodeID,
        networkIDs.PrimaryNetworkID.toString(),
        start,
        end,
        BigInt(params.amount!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        Number(params.delegationFee) * 1e4, // default fee is 10%
        undefined,
        1,
        0n,
        blsPublicKey,
        blsSignature
      )
      return stakeTx
    }
    case 'delegate': {
      const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32!] })
      const start = BigInt(params.startTime!)
      const end = BigInt(params.endTime!)
      const nodeID = params?.nodeId!

      const delegateTx = pvm.newAddPermissionlessDelegatorTx(
        context,
        utxos,
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        nodeID,
        networkIDs.PrimaryNetworkID.toString(),
        start,
        end,
        BigInt(params.amount!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)]
      )
      return delegateTx
    }
    default:
      throw new Error(`Unknown transaction type: ${transactionType}`)
  }
}

async function sendSignedTxJson(ctx: Context, signedTxJson: SignedTxJson): Promise<string> {
  const unsignedTx = UnsignedTx.fromJSON(signedTxJson.serialization)
  const signature = Buffer.from(signedTxJson.signature, 'hex')
  unsignedTx.addSignature(signature)
  const signedTx = unsignedTx.getSignedTx()
  switch (signedTxJson.transactionType) {
    case 'exportCP':
    case 'importPC': {
      const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
      const resp = await evmapi.issueSignedTx(signedTx)
      return resp.txID
    }
    case 'exportPC':
    case 'importCP':
    case 'stake':
    case 'delegate': {
      const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
      const resp = await pvmapi.issueSignedTx(signedTx)
      return resp.txID
    }
    default:
      throw new Error(`Unknown transaction type: ${signedTxJson.transactionType}`)
  }
}

function getPublicKeyFromPair(keypair: [Buffer<ArrayBufferLike>, Buffer<ArrayBufferLike>]): string {
  const pk = Buffer.concat(keypair).toString('hex')
  return pk
}

async function buildAndSendTxUsingPrivateKey(
  transactionType: string,
  ctx: Context,
  params: FlareTxParams,
  stakeParams?: StakeParams
): Promise<{ txid: string; usedFee?: string }> {
  // TODO: needed?
  const processTx = async (_summary: TxSummary): Promise<boolean> => {
    //if (txSettings.exportSignedTx) {
    //  try {
    //    utils.saveToFile(
    //      JSON.stringify(summary, undefined, "  "),
    //      `${utils.timestamp()}_${summary.type}.json`,
    //    );
    //  } catch {}
    //}
    //if (txSettings.copySignedTx) {
    //  try {
    //    await utils.copyToClipboard(summary.signedTx);
    //  } catch {}
    //}
    //return txSettings.submitTx;

    // Return default value
    return true
  }

  if (transactionType === 'exportCP') {
    return await exportCP(ctx, params)
  } else if (transactionType === 'exportPC') {
    return await exportPC(ctx, params)
  } else if (transactionType === 'importCP') {
    return await importCP(ctx, params)
  } else if (transactionType === 'importPC') {
    return await importPC(ctx, params)
  } else if (transactionType === 'stake') {
    return await addValidator(ctx, params)
  } else if (transactionType === 'delegate') {
    return await addDelegator(ctx, params)
  } else {
    throw new Error(`Unknown transaction type ${transactionType}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// initializing ctx.json

export async function initCtxJsonFromOptions(
  options: OptionValues,
  derivationPath = BASE_DERIVATION_PATH
): Promise<void> {
  let ctxFile: ContextFile
  if (options.ledger) {
    const publicKey = await ledger.getPublicKey(derivationPath, options.network)
    const address = await ledger.verifyCAddress(derivationPath)
    const ethAddress = publicKeyToEthereumAddressString(publicKey)
    ctxFile = {
      wallet: 'ledger',
      publicKey,
      ethAddress,
      flareAddress: address,
      network: options.network,
      derivationPath
    }
  } else if (options.publicKey) {
    if (!validatePublicKey(options.publicKey)) return logError('Invalid public key')
    ctxFile = {
      wallet: 'publicKey',
      publicKey: options.publicKey,
      network: options.network
    }
    if (options.vaultId) {
      ctxFile = {
        ...ctxFile,
        vaultId: options.vaultId
      }
    }
  } else {
    throw new Error('Either --ledger or --public-key must be specified')
  }
  initCtxJson(ctxFile)
  logSuccess('Context file created')
}

//////////////////////////////////////////////////////////////////////////////////////////
// Network info
/**
 * @description Logs the address info
 * @param ctx - the context file aka ctx.json
 * @returns Returns the address info
 */
export function logAddressInfo(ctx: Context): void {
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
export async function logBalanceInfo(ctx: Context): Promise<void> {
  let cbalance = toBN((await ctx.web3.eth.getBalance(ctx.cAddressHex!)).toString())!.toString()
  let pbalance = toBN(
    // NOTE: HRP seems the right string for this function
    await getPBalance(ctx.config.hrp, ctx.pAddressBech32!)
  )!.toString()
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
export function logNetworkInfo(ctx: Context): void {
  // TODO: necessary?
  //const pchainId = ctx.pchain.getBlockchainID();
  //const cchainId = ctx.cchain.getBlockchainID();
  logInfo(`Information about the network "${ctx.config.hrp}"`)
  //log(`blockchainId for P-chain: ${ctx.config.chainID}`);
  //log(`blockchainId for C-chain: ${ctx.config.chainID}`);
  //log(`assetId: ${ctx.avaxAssetID}`);
}

/**
 * @description Logs the validator information regrading current and pending validators
 * @param ctx - the context file
 */
export async function logValidatorInfo(ctx: Context): Promise<void> {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const pending = await pvmapi.getPendingValidators()
  const current = await pvmapi.getCurrentValidators()
  //const pending = await ctx.pchain.getPendingValidators();
  //const current = await ctx.pchain.getCurrentValidators();
  const fpending = JSON.stringify(pending.validators, null, 2)
  const fcurrent = JSON.stringify(current.validators, null, 2)
  logInfo(`Validators on the network "${ctx.config.hrp}"`)
  log(`pending: ${fpending}`)
  log(`current: ${fcurrent}`)
}

/**
 * @description Logs mirror fund details
 * @param ctx - context
 */
export async function logMirrorFundInfo(ctx: Context): Promise<void> {
  const mirroFundDetails = await fetchMirrorFunds(ctx);
  logInfo(`Mirror fund details on the network "${ctx.config.hrp}"`);
  log(JSON.stringify(mirroFundDetails, null, 2));
}

//////////////////////////////////////////////////////////////////////////////////////////
// Transaction building and execution
async function cliBuildAndSendTxUsingLedger(
  transactionType: string,
  ctx: Context,
  params: FlareTxParams,
  _blind: boolean,
  _derivationPath: string
): Promise<void> {
  if (transactionType === 'exportCP' || transactionType === 'exportPC') {
    logInfo('Creating export transaction...')
  }
  if (transactionType === 'importCP' || transactionType === 'importPC') {
    logInfo('Creating import transaction...')
  }
  const sign = async (request: TxDetails): Promise<string> => {
    if (request.isEvmTx) {
      return ledger.signEvmTransaction(_derivationPath, request.unsignedTxHex)
    } else if (await ledger.onlyHashSign()) {
      return ledger.signHash(_derivationPath, request.unsignedTxHash!)
    } else {
      return ledger.sign(_derivationPath, request.unsignedTxHex)
    }
  }
  if (transactionType === 'exportCP') {
    let tp: ExportCTxParams = {
      amount: toBN(params.amount)!,
      exportFee: toBN(params.fee)!,
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!)
    }
    await flare.exportCP(tp, sign)
    return
  } else if (transactionType === 'importCP') {
    let tp: ImportPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!)
    }
    await flare.importCP(tp, sign)
    return
  } else if (transactionType === 'exportPC') {
    let tp: ExportPTxParams = {
      amount: toBN(params.amount)!,
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!)
    }
    await flare.exportPC(tp, sign)
    return
  } else if (transactionType === 'importPC') {
    let tp: ImportCTxParams = {
      importFee: toBN(params.fee)!,
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!)
    }
    await flare.importPC(tp, sign)
    return
  } else if (transactionType === 'stake') {
    logInfo('Creating stake transaction...')
    let tp: ValidatorPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!),
      delegationFee: Number(params.delegationFee)  * 1e4, // default fee is 10%
      nodeId: params.nodeId!,
      popBLSPublicKey: futils.hexToBuffer(params.popBlsPublicKey!),
      popBLSSignature: futils.hexToBuffer(params.popBlsSignature!),
      amount: new BN(params.amount!),
      startTime: new BN(params.startTime!),
      endTime: new BN(params.endTime!),

      // unnecessary?
      useConsumableUTXOs: false,
      customUTXOs: []
    }
    await flare.addValidator(tp, sign, true)
    return
  } else if (transactionType === 'delegate') {
    logInfo('Creating delegate transaction...')
    let tp: DelegatorPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!),
      nodeId: params.nodeId!,
      amount: new BN(params.amount!),
      startTime: new BN(params.startTime!),
      endTime: new BN(params.endTime!),

      // unnecessary?
      useConsumableUTXOs: false,
      customUTXOs: []
    }
    // let presubmit =  null (): Promise<boolean> => new Promise(() => false)
    await flare.addDelegator(tp, sign, true)
    return
  }
}

async function cliBuildAndSaveUnsignedTxJson(
  transactionType: string,
  ctx: Context,
  id: string,
  params: FlareTxParams,
): Promise<void> {
  const unsignedTx: UnsignedTx = await buildUnsignedTx(
    transactionType,
    ctx,
    params,
  );
  const txBuffer = Buffer.from(unsignedTx.toBytes()).toString('hex');
  const txMessage = Buffer.from(messageHashFromUnsignedTx(unsignedTx)).toString('hex');
  const unsignedTxJson: UnsignedTxJson = {
    transactionType,
    signatureRequests: [{
      message: txMessage,
      signer: ''
    }],
    unsignedTransactionBuffer: txBuffer,
    serialization: JSON.stringify(unsignedTx.toJSON()),
  }
  saveUnsignedTxJson(unsignedTxJson, id);
  logSuccess(`Unsigned transaction ${id} constructed`);
}

async function cliSendSignedTxJson(ctx: Context, id: string): Promise<void> {
  if (isAlreadySentToChain(id)) {
    throw new Error("Tx already sent to chain");
  }
  const signedTxnJson = readSignedTxJson(id);
  let chainTxId;
  if (signedTxnJson.transactionType === "EVM") {
    chainTxId = await sendSignedEvmTransaction(ctx, id)
  } else {
    chainTxId = await sendSignedTxJson(ctx, signedTxnJson);
  }
  addFlagForSentSignedTx(id);
  logSuccess(
    `Signed transaction ${id} with hash ${chainTxId} sent to the node`,
  );
}

async function cliBuildAndSendTxUsingPrivateKey(
  transactionType: string,
  ctx: Context,
  params: FlareTxParams
): Promise<void> {
  const { txid, usedFee } = await buildAndSendTxUsingPrivateKey(transactionType, ctx, params)
  const symbol = networkTokenSymbol[ctx.config.hrp]
  if (usedFee) logInfo(`Used fee of ${integerToDecimal(usedFee, 9)} ${symbol}`)
  logSuccess(`Transaction with hash ${txid} built and sent to the network`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// ForDefi

async function signForDefi(
  transaction: string,
  ctx: string,
  evmTx: boolean = false,
): Promise<void> {
  const txid = await sendToForDefi(transaction, ctx, evmTx);
  logSuccess(`Transaction with hash ${txid} sent to the ForDefi`);
}

async function fetchForDefiTx(
  transaction: string,
  evmTx: boolean = false,
): Promise<void> {
  if (isAlreadySentToChain(transaction)) {
    throw new Error("Tx already sent to chain");
  }
  const signature = await getSignature(transaction, evmTx);
  logSuccess(`Success! Signature: ${signature}`);
}

async function buildUnsignedWithdrawalTxJson(
  ctx: Context,
  to: string,
  amount: number,
  id: string,
  nonce: number
): Promise<void> {
  const fileId = await createWithdrawalTransaction(ctx, to, amount, id, nonce)
  logSuccess(`Transaction ${fileId} constructed`)
}

async function buildUnsignedOptOutTxJson(ctx: Context, to: string, amount: number, id: string, nonce: number): Promise<void> {
  const fileId = await createOptOutTransaction(ctx, id, nonce)
  logSuccess(`Transaction ${fileId} constructed`)
}
