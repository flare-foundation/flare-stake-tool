import { Command, OptionValues } from 'commander'
// import BN from "bn.js";
import { BigNumber, ethers } from 'ethersV5'
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
  UnsignedTx
} from '@flarenetwork/flarejs'
import { Context, ContextFile, FlareTxParams } from './interfaces'
import { rpcUrlFromNetworkConfig, contextEnv, contextFile, getContext } from './context'
import {
  compressPublicKey,
  integerToDecimal,
  decimalToInteger,
  toBN,
  initCtxJson,
  publicKeyToEthereumAddressString,
  validatePublicKey,
  readUnsignedTxJson
} from './utils'
//import {
//  exportTxCP,
//  importTxPC,
//  getUnsignedExportTxCP,
//  getUnsignedImportTxPC,
//  issueSignedEvmTxPCImport,
//  issueSignedEvmTxCPExport
//} from './transaction/evmAtomicTx'
//import {
//  exportTxPC,
//  importTxCP,
//  getUnsignedImportTxCP,
//  getUnsignedExportTxPC,
//  issueSignedPvmTx
//} from './transaction/pvmAtomicTx'
//import { addValidator, getUnsignedAddValidator } from './transaction/addValidator'
//import { addDelegator, getUnsignedAddDelegator } from './transaction/addDelegator'
//import { ledgerGetAccount } from "./ledger/key";
//import { ledgerSign } from "./ledger/sign";
//import { getSignature, sendToForDefi } from "./forDefi/transaction";
import { createWithdrawalTransaction, sendSignedWithdrawalTransaction } from './forDefi/withdrawal'
import { log, logError, logInfo, logSuccess } from './output'
//import {
//  submitForDefiTxn,
//  fetchMirrorFunds,
//  optOutOfAirdrop,
//} from "./contracts";
//import { contractTransactionName } from "./constants/contracts";
// import { walletConstants } from "./constants/screen";

import * as ledger from './ledger'
import * as flare from './flare'
import * as settings from './settings'
import { StakeParams } from './ui/interfaces'
import { getPBalance } from './flare/chain'
import { JsonRpcProvider } from 'ethers'
import { BN } from 'bn.js'
import { addDelegator, addValidator, exportCP, exportPC, importCP, importPC } from './transaction'

const BASE_DERIVATION_PATH = "m/44'/60'/0'/0/0" // base derivation path for ledger
const FLR = 1e9 // one FLR in nanoFLR
// const MAX_TRANSCTION_FEE = FLR;

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
      'Type of a crosschain transaction'
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
    .option('--pop-bls-public-key <popBLSPublicKey>', 'BLS Public Key')
    .option('--pop-bls-signature <popBLSSignature>', 'BLS Signature')
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
      }
      //else {
      //await cliBuildUnsignedTxJson(
      //  type,
      //  ctx,
      //  options.transactionId,
      //  options as FlareTxParams,
      //);
      //}
    })
  // signed transaction sending
  //program
  //  .command("send")
  //  .description("Send signed transaction json to the node")
  //  .option(
  //    "-i, --transaction-id <transaction-id>",
  //    "Id of the transaction to send to the network",
  //  )
  //  .action(async (options: OptionValues) => {
  //    options = getOptions(program, options);
  //    const ctx = await contextFromOptions(options);
  //    await cliSendSignedTxJson(ctx, options.transactionId);
  //  });
  // forDefi signing
  //program
  //  .command("forDefi")
  //  .description("Sign with ForDefi")
  //  .argument("<sign|fetch>", "Type of a forDefi transaction")
  //  .option(
  //    "-i, --transaction-id <transaction-id>",
  //    "Id of the transaction to finalize",
  //  )
  //  .option("--withdrawal", "Withdrawing funds from c-chain")
  //  .action(async (type: string, options: OptionValues) => {
  //    options = getOptions(program, options);
  //    if (type == "sign") {
  //      if (options.withdrawal) {
  //        await signForDefi(options.transactionId, options.ctxFile, true);
  //      } else {
  //        await signForDefi(options.transactionId, options.ctxFile);
  //      }
  //    } else if (type == "fetch") {
  //      if (options.withdrawal) {
  //        await fetchForDefiTx(options.transactionId, true);
  //      } else {
  //        await fetchForDefiTx(options.transactionId);
  //      }
  //    }
  //  });
  // withdrawal from c-chain
  program
    .command('withdrawal')
    .description('Withdraw funds from c-chain')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('-a, --amount <amount>', 'Amount to transfer')
    .option('-t, --to <to>', 'Address to send funds to')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .option('--send-signed-tx', 'Send signed transaction json to the node')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      if (options.sendSignedTx) {
        await withdraw_useSignature(ctx, options.transactionId)
      } else {
        // create unsigned transaction
        await withdraw_getHash(
          ctx,
          options.to,
          options.amount,
          options.transactionId,
          options.nonce
        )
      }
    })
  // Opt-out from Airdrop
  // TODO: Needed?
  //program
  //  .command("opt-out")
  //  .description(
  //    "Opt-out from the Flare Drop i.e execute optOutOfAirdrop function on DistributionToDelegators smart contract",
  //  )
  //  .option(
  //    "-i, --transaction-id <transaction-id>",
  //    "Id of the transaction to finalize",
  //  )
  //  .action(async (options: OptionValues) => {
  //    options = getOptions(program, options);
  //    const ctx = await contextFromOptions(options);
  //    if (options.getHacked) {
  //      await optOutOfAirdropPrivateKey(Object.keys(walletConstants)[2], ctx);
  //    } else if (options.ledger) {
  //      await optOutOfAirdropLedger(
  //        Object.keys(walletConstants)[0],
  //        ctx.cAddressHex!,
  //        options.derivationPath,
  //        options.network,
  //      );
  //    } else {
  //      // for ForDefi
  //      await optOutOfAirdropForDefi(
  //        Object.keys(walletConstants)[1],
  //        options.transactionId,
  //        ctx,
  //      );
  //    }
  //  });
  // sign and submit smart contract transaction
  program
    .command('signAndSubmit')
    .description('Sign a transaction using private key and submit to chain')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx: Context = await contextFromOptions(options)
      await signAndSend(ctx, options.network, options.transactionId)
    })
}

// TODO: needed?
//export async function optOutOfAirdropPrivateKey(wallet: string, ctx: Context) {
//  const optOutParams: OptOutOfAirdropInterface = {
//    cAddress: ctx.cAddressHex!,
//    network: ctx.config.hrp,
//    wallet: wallet,
//    pvtKey: ctx.privkHex,
//  };
//  await optOutOfAirdrop(optOutParams);
//  console.log(chalk.green("Successfully opted out"));
//}

//export async function optOutOfAirdropLedger(
//  wallet: string,
//  ctxCAddress: string,
//  ctxDerivationPath: string,
//  ctxNetwork: string,
//) {
//  const optOutParams: OptOutOfAirdropInterface = {
//    cAddress: ctxCAddress,
//    network: ctxNetwork,
//    wallet: wallet,
//    derivationPath: ctxDerivationPath,
//  };
//  console.log("Please sign the transaction on your ledger");
//  await optOutOfAirdrop(optOutParams);
//  console.log(chalk.green("Successfully opted out"));
//}

//export async function optOutOfAirdropForDefi(
//  wallet: string,
//  transactionId: string,
//  ctx: Context,
//) {
//  const optOutParams: OptOutOfAirdropInterface = {
//    cAddress: ctx.cAddressHex!,
//    network: ctx.config.hrp,
//    wallet: wallet,
//    transactionId: transactionId,
//  };
//  await optOutOfAirdrop(optOutParams);
//}

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
      //network = networkFromContextFile(options.ctxFile);
      // TODO:
      throw 'e'
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
/**
 * @description - Returms the fee getting used
 * @param cap - the max allowed free
 * @param usedFee - fee that was used
 * @param specifiedFee - fee specified by the user
 */
export function capFeeAt(
  cap: number,
  network: string,
  usedFee?: string,
  specifiedFee?: string
): void {
  if (usedFee !== undefined && usedFee !== specifiedFee) {
    // if usedFee was specified by the user, we don't cap it
    const usedFeeNumber = Number(usedFee) // if one of the fees is defined, usedFee is defined
    const symbol = networkTokenSymbol[network]
    if (usedFeeNumber > cap)
      throw new Error(
        `Used fee of ${usedFeeNumber / FLR} ${symbol} is higher than the maximum allowed fee of ${cap / FLR} ${symbol}`
      )
    logInfo(`Using fee of ${usedFeeNumber / FLR} ${symbol}`)
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
// transaction-type translators

async function buildUnsignedTxJson(
  transactionType: string,
  ctx: Context,
  params: FlareTxParams
): Promise<UnsignedTx> {
  const provider = new JsonRpcProvider(settings.URL[ctx.config.hrp] + '/ext/bc/C/rpc')
  const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const txCount = await provider.getTransactionCount(ctx.cAddressHex!)
  const baseFee = await evmapi.getBaseFee()
  function getChainIdFromContext(sourceChain: 'X' | 'P' | 'C', context: FContext.Context) {
    return sourceChain === 'C'
      ? context.cBlockchainID
      : sourceChain === 'P'
        ? context.pBlockchainID
        : context.xBlockchainID
  }

  switch (transactionType) {
    case 'exportCP': {
      const exportTx = evm.newExportTxFromBaseFee(
        context,
        baseFee / BigInt(FLR),
        BigInt(params.amount!),
        context.pBlockchainID,
        futils.hexToBuffer(ctx.cAddressHex!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        BigInt(txCount)
      )
      return new Promise(() => exportTx)
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
      return new Promise(() => importTx)
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
      return new Promise(() => exportTx)
    }
    case 'importPC': {
      const { utxos } = await evmapi.getUTXOs({
        sourceChain: 'P',
        addresses: [ctx.cAddressBech32!]
      })

      const exportTx = evm.newImportTxFromBaseFee(
        context,
        futils.hexToBuffer(ctx.cAddressHex!),
        [futils.bech32ToBytes(ctx.pAddressBech32!)],
        utxos,
        getChainIdFromContext('P', context),
        baseFee / BigInt(FLR)
      )
      return new Promise(() => exportTx)
    }
    //case 'stake': {
    //  return getUnsignedAddValidator(
    //    ctx,
    //    params.nodeId!,
    //    toBN(params.amount)!,
    //    toBN(params.startTime)!,
    //    toBN(params.endTime)!,
    //    Number(params.delegationFee!),
    //    Number(params.threshold!)
    //  )
    //}
    //case 'delegate': {
    //  return getUnsignedAddDelegator(
    //    ctx,
    //    params.nodeId!,
    //    toBN(params.amount)!,
    //    toBN(params.startTime)!,
    //    toBN(params.endTime)!,
    //    Number(params.threshold!)
    //  )
    //}
    default:
      throw new Error(`Unknown transaction type: ${transactionType}`)
  }
}

//async function sendSignedTxJson(ctx: Context, signedTxJson: SignedTxJson): Promise<string> {
//  switch (signedTxJson.transactionType) {
//    case 'exportCP': {
//      const { chainTxId } = await issueSignedEvmTxCPExport(ctx, signedTxJson)
//      return chainTxId
//    }
//    case 'importPC': {
//      const { chainTxId } = await issueSignedEvmTxPCImport(ctx, signedTxJson)
//      return chainTxId
//    }
//    case 'exportPC':
//    case 'importCP':
//    case 'stake':
//    case 'delegate': {
//      const { chainTxId } = await issueSignedPvmTx(ctx, signedTxJson)
//      return chainTxId
//    }
//    default:
//      throw new Error(`Unknown transaction type: ${signedTxJson.transactionType}`)
//  }
//}

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
    return addDelegator(ctx, params)
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
export async function logMirrorFundInfo(_ctx: Context): Promise<void> {
  log('not implemented')
  // const mirroFundDetails = await fetchMirrorFunds(ctx);
  // logInfo(`Mirror fund details on the network "${ctx.config.hrp}"`);
  // log(JSON.stringify(mirroFundDetails, null, 2));
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
    let tp: ValidatorPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey!),
      delegationFee: Number(params.delegationFee) ?? 0,
      nodeId: params.nodeId!,
      popBLSPublicKey: futils.hexToBuffer(params.popBLSPublicKey!),
      popBLSSignature: futils.hexToBuffer(params.popBLSSignature!),
      amount: new BN(params.amount!),
      startTime: new BN(params.startTime!),
      endTime: new BN(params.endTime!),

      // unnecessary?
      useConsumableUTXOs: false,
      customUTXOs: []
    }
    await flare.addValidator(tp, sign)
    return
  } else if (transactionType === 'delegate') {
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
    let presubmit = (): Promise<boolean> => new Promise(() => false)
    await flare.addDelegator(tp, sign, presubmit)
    return
  }
}

//async function cliBuildAndSendTxUsingLedger(
//  transactionType: string,
//  ctx: Context,
//  params: FlareTxParams,
//  blind: boolean,
//  derivationPath: string
//): Promise<void> {
//  if (transactionType === 'exportCP' || transactionType === 'exportPC') {
//    logInfo('Creating export transaction...')
//  }
//  if (transactionType === 'importCP' || transactionType === 'importPC') {
//    logInfo('Creating import transaction...')
//  }
//  const tx = await buildUnsignedTxJson(transactionType, ctx, params)
//  const txHex = toHex(messageHashFromUnsignedTx(tx))
//  logInfo(`Please review and sign transaction on your ledger device...`)
//  const signature = await ledger.signEvmTransaction(derivationPath, txHex)
//  //const signedTxJson = { ...unsignedTxJson, signature }
//  //logInfo('Sending transaction to the node...')
//  //const chainTxId = await sendSignedTxJson(ctx, signedTxJson)
//  //logSuccess(`Transaction with hash ${chainTxId} sent to the node`)
//}

//const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(
//  transactionType,
//  ctx,
//  params,
//);
//capFeeAt(
//  MAX_TRANSCTION_FEE,
//  ctx.config.hrp,
//  unsignedTxJson.usedFee,
//  params.fee,
//);
//if (blind) {
//  const filename = unsignedTxJson.signatureRequests[0].message.slice(0, 6);
//  saveUnsignedTxJson(unsignedTxJson, filename, "proofs");
//  logWarning(
//    `Blind signing! Validate generated proofs/${filename}.unsignedTx.json file.`,
//  );
//}
//logInfo(`Please review and sign transaction on your ledger device...`);
//const { signature } = await ledgerSign(unsignedTxJson, derivationPath, blind);
//const signedTxJson = { ...unsignedTxJson, signature };
//logInfo("Sending transaction to the node...");
//const chainTxId = await sendSignedTxJson(ctx, signedTxJson);
//logSuccess(`Transaction with hash ${chainTxId} sent to the node`);
//}

//async function cliBuildUnsignedTxJson(
//  transactionType: string,
//  ctx: Context,
//  id: string,
//  params: FlareTxParams,
//): Promise<void> {
//  const unsignedTxJson: UnsignedTxJson = await buildUnsignedTxJson(
//    transactionType,
//    ctx,
//    params,
//  );
//  capFeeAt(
//    MAX_TRANSCTION_FEE,
//    ctx.config.hrp,
//    unsignedTxJson.usedFee,
//    params.fee,
//  );
//  saveUnsignedTxJson(unsignedTxJson, id);
//  logSuccess(`Unsigned transaction ${id} constructed`);
//}

//async function cliSendSignedTxJson(ctx: Context, id: string): Promise<void> {
//  if (isAlreadySentToChain(id)) {
//    throw new Error("Tx already sent to chain");
//  }
//  const signedTxnJson = readSignedTxJson(id);
//  let chainTxId;
//  if (signedTxnJson.transactionType === contractTransactionName) {
//    chainTxId = await submitForDefiTxn(
//      id,
//      signedTxnJson.signature,
//      ctx.config.hrp,
//    );
//  } else {
//    chainTxId = await sendSignedTxJson(ctx, signedTxnJson);
//  }
//  addFlagForSentSignedTx(id);
//  logSuccess(
//    `Signed transaction ${id} with hash ${chainTxId} sent to the node`,
//  );
//}

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
// Transaction execution using ForDefi api

//async function signForDefi(
//  transaction: string,
//  ctx: string,
//  withdrawal: boolean = false,
//): Promise<void> {
//  const txid = await sendToForDefi(transaction, ctx, withdrawal);
//  logSuccess(`Transaction with hash ${txid} sent to the ForDefi`);
//}

//async function fetchForDefiTx(
//  transaction: string,
//  withdrawal: boolean = false,
//): Promise<void> {
//  if (isAlreadySentToChain(transaction)) {
//    throw new Error("Tx already sent to chain");
//  }
//  const signature = await getSignature(transaction, withdrawal);
//  logSuccess(`Success! Signature: ${signature}`);
//}

async function withdraw_getHash(
  ctx: Context,
  to: string,
  amount: number,
  id: string,
  nonce: number
): Promise<void> {
  const fileId = await createWithdrawalTransaction(ctx, to, amount, id, nonce)
  logSuccess(`Transaction ${fileId} constructed`)
}

async function withdraw_useSignature(ctx: Context, id: string): Promise<void> {
  const txId = await sendSignedWithdrawalTransaction(ctx, id)
  logSuccess(`Transaction ${txId} sent to the node`)
}

//////////////////////////////////////////////////////////////////////////////////////////
// smart contract transaction signing

async function signAndSend(ctx: Context, network: string, id: string): Promise<void> {
  const tx = readUnsignedTxJson(id) as any
  if (!tx) throw new Error('Invalid txn file')

  const valueStr = tx.rawTx.value
  const valueBN = BigNumber.from(valueStr)
  tx.rawTx.value = valueBN
  const provider = new ethers.providers.JsonRpcProvider(rpcUrlFromNetworkConfig(network))

  const wallet = new ethers.Wallet(ctx.privkHex!)
  const signedTx = await wallet.signTransaction(tx.rawTx)
  const chainId = await provider.sendTransaction(signedTx)
  logSuccess(`Signed transaction ${id} with hash ${chainId.hash} sent to the node`)
}
