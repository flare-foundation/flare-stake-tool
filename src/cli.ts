import { Command, OptionValues } from 'commander'
import {
  ExportPTxParams,
  ImportCTxParams,
  ImportPTxParams,
  ExportCTxParams,
  TxDetails,
  ValidatorPTxParams,
  DelegatorPTxParams,
  TransferPTxParams
} from './flare/interfaces'
import {
  pvm,
  evm,
  utils as futils,
  TransferableOutput,
  Context as FContext,
  UnsignedTx,
  messageHashFromUnsignedTx,
  networkIDs,
  info
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
  isAlreadySentToChain,
  addFlagForSentSignedTx,
  readSignedTxJson,
  saveUnsignedTxJson,
  adjustStartTime,
  adjustStartTimeForDefi
} from './utils'
import {
  createClaimTransaction,
  createCustomCChainTransaction,
  createOptOutTransaction,
  createSetAllowedClaimRecipientsTransaction,
  createSetClaimExecutorsTransaction,
  createWithdrawalTransaction,
  saveUnsignedClaimTx,
  sendSignedEvmTransaction,
  signEvmTransaction
} from './forDefi/evmTx'
import { log, logError, logInfo, logSuccess } from './output'
import * as ledger from './ledger'
import * as flare from './flare'
import * as settings from './settings'
import { getPBalance } from './flare/chain'
import { JsonRpcProvider } from 'ethers'
import { BN } from 'bn.js'
import {
  addDelegator,
  addValidator,
  exportCP,
  exportPC,
  importCP,
  importPC,
  internalTransfer
} from './transaction'
import { getSignature, sendToForDefi } from './forDefi/transaction'
import { fetchMirrorFunds } from './contracts'

const BASE_DERIVATION_PATH = "m/44'/60'/0'/0/0" // base derivation path for ledger

// mapping from network to symbol
export const networkTokenSymbol: { [index: string]: string } = {
  flare: 'FLR',
  songbird: 'SGB',
  costwo: 'C2FLR',
  coston: 'CFLR',
  localflare: 'PHT'
}

export function cli(program: Command): void {
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
      await initCtxJsonFromOptions(options)
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
    .description(
      'Move funds from one chain to another or to another P-chain address, stake, and delegate'
    )
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
    .option('--transfer-address <transfer-address>', 'P-chain address to transfer funds to')
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
          options.blind as boolean,
          options.derivationPath as string
        )
      } else {
        await cliBuildAndSaveUnsignedTxJson(
          type,
          ctx,
          options.transactionId as string,
          options as FlareTxParams
        )
      }
    })
  // signed transaction sending
  program
    .command('send')
    .description('Send signed transaction json to the node')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to send to the network')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await cliSendSignedTxJson(ctx, options.transactionId as string)
    })
  // ForDefi signing
  program
    .command('forDefi')
    .description('Sign with ForDefi')
    .argument('<sign|fetch>', 'Type of a forDefi transaction')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('--evm-tx', 'Regular EVM transaction')
    .action(async (type: string, options: OptionValues) => {
      options = getOptions(program, options)
      if (typeof options.transactionId !== 'string') {
        throw new Error('Option --blind must be a string')
      }
      if (type == 'sign') {
        if (typeof options.ctxFile !== 'string') {
          throw new Error('Option --ctx-file must be a string')
        }
        if (options.evmTx) {
          await signForDefi(options.transactionId, options.ctxFile, true)
        } else {
          await signForDefi(options.transactionId, options.ctxFile)
        }
      } else if (type == 'fetch') {
        if (options.evmTx) {
          await fetchForDefiTx(options.transactionId, true)
        } else {
          await fetchForDefiTx(options.transactionId)
        }
      }
    })
  // withdrawal (transfer) from C-chain (ForDefi)
  program
    .command('withdrawal')
    .description('Withdraw funds from C-chain')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('-a, --amount <amount>', 'Amount to transfer')
    .option('-t, --to <to>', 'Address to send funds to')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await buildUnsignedWithdrawalTxJson(
        ctx,
        options.to as string,
        options.amount as number,
        options.transactionId as string,
        options.nonce as number
      )
    })
  // opt out (ForDefi)
  program
    .command('optOut')
    .description('Opt out of airdrop on the c-chain')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await buildUnsignedOptOutTxJson(ctx, options.transactionId as string, options.nonce as number)
    })
  // claim staking (ValidatorRewardManager) rewards
  program
    .command('claim')
    .description('claim staking rewards')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('-n,--nonce <nonce>', 'Nonce of the constructed transaction')
    .option('-a, --amount <amount>', 'Amount to claim')
    .option('-r, --recipient <recipient>', 'Address to send the rewards to')
    .option('-w, --wrap', 'Wrap the rewards', false)
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      await processClaimTx(
        options,
        options.transactionId as string,
        options.amount as number,
        options.recipient as string,
        options.wrap as boolean,
        options.nonce as number
      )
    })
  // set claim executor (ForDefi)
  program
    .command('setClaimExecutors')
    .description('Set claim executors for claiming FSP rewards')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .option(
      '--executors <executors...>',
      'Addresses of the executors to set (space separated); empty string to remove all executors'
    )
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await buildUnsignedSetClaimExecutorsTxJson(
        ctx,
        options.transactionId as string,
        options.executors as string[],
        options.nonce as number
      )
    })
  // set allowed claim recipients (ForDefi)
  program
    .command('setAllowedClaimRecipients')
    .description('Set allowed claim recipients for claiming FSP rewards')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .option(
      '--recipients <recipients...>',
      'Addresses of the allowed claim recipients (space separated)'
    )
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await buildUnsignedSetAllowedClaimRecipientsTxJson(
        ctx,
        options.transactionId as string,
        options.recipients as string[],
        options.nonce as number
      )
    })
  // custom c-chain transaction (ForDefi)
  program
    .command('customCChainTx')
    .description('Custom C-chain transaction')
    .option('-i, --transaction-id <transaction-id>', 'Id of the transaction to finalize')
    .option('--nonce <nonce>', 'Nonce of the constructed transaction')
    .option('--data <data>', 'Data to send in the transaction', '')
    .option('--to <to>', 'Address to send the transaction to')
    .option('--value <value>', 'Value to send in the transaction', '0')
    .action(async (options: OptionValues) => {
      options = getOptions(program, options)
      const ctx = await contextFromOptions(options)
      await buildUnsignedCustomCChainTxJson(
        ctx,
        options.transactionId as string,
        options.data as string,
        options.to as string,
        options.value as string,
        options.nonce as number
      )
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
    const publicKey = await ledger.getPublicKey(
      options.derivationPath as string,
      options.network as string
    )
    const ctx = getContext(options.network as string, publicKey)
    return ctx
  } else if (options.envPath) {
    return contextEnv(options.envPath as string, options.network as string)
  } else {
    return contextFile(options.ctxFile as string)
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
  let network = options.network as string
  if (network == undefined) {
    try {
      network = networkFromContextFile(options.ctxFile as string)
    } catch (e: any) {
      network = 'flare'
      logError(
        `Error ${e}. No network was passed and no context file was found. Defaulting to flare network`
      )
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
    if (typeof allOptions.amount !== 'string') {
      throw new Error('Option --amount must be a string')
    }
    const cleanedAmount = allOptions.amount.replace(/,/g, '')
    allOptions.amount = decimalToInteger(cleanedAmount, 9).toString()
  }
  if (allOptions.fee) {
    allOptions.fee = decimalToInteger(allOptions.fee as string, 9)
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
  if (!ctx.cAddressHex) {
    throw new Error('C-chain address is not set in the context file')
  }
  if (!ctx.pAddressBech32) {
    throw new Error('P-chain bech32 address is not set in the context file')
  }
  if (!ctx.cAddressBech32) {
    throw new Error('C-chain bech32 address is not set in the context file')
  }
  const provider = new JsonRpcProvider(settings.URL[ctx.config.hrp] + '/ext/bc/C/rpc')
  const evmapi = new evm.EVMApi(settings.URL[ctx.config.hrp])
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const infoapi = new info.InfoApi(settings.URL[ctx.config.hrp])
  const context = await FContext.getContextFromURI(settings.URL[ctx.config.hrp])
  const txCount = await provider.getTransactionCount(ctx.cAddressHex)
  const feeState = await pvmapi.getFeeState()
  feeState.price = 1000n;
  const { etnaTime } = await infoapi.getUpgradesInfo()

  const isEtnaForkActive = new Date() > new Date(etnaTime)

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
      if (!params.amount) {
        throw new Error(
          `amount is required for exportCP transaction. Use --amount <amount> to specify the amount`
        )
      }
      const nonce = params.nonce ?? txCount
      const exportTx = evm.newExportTx(
        context,
        BigInt(params.amount),
        context.pBlockchainID,
        futils.hexToBuffer(ctx.cAddressHex),
        [futils.bech32ToBytes(ctx.pAddressBech32)],
        BigInt(params.fee),
        BigInt(nonce)
      )
      return exportTx
    }
    case 'importCP': {
      const { utxos } = await pvmapi.getUTXOs({
        sourceChain: 'C',
        addresses: [ctx.pAddressBech32]
      })

      let importTx: UnsignedTx
      if (isEtnaForkActive) {
        importTx = pvm.e.newImportTx(
          {
            feeState,
            fromAddressesBytes: [futils.bech32ToBytes(ctx.cAddressBech32)],
            sourceChainId: getChainIdFromContext('C', context),
            toAddressesBytes: [futils.bech32ToBytes(ctx.pAddressBech32)],
            utxos
          },
          context
        )
      } else {
        importTx = pvm.newImportTx(
          context,
          getChainIdFromContext('C', context),
          utxos,
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          [futils.bech32ToBytes(ctx.cAddressBech32)]
        )
      }
      return importTx
    }
    case 'exportPC': {
      const { utxos } = await pvmapi.getUTXOs({
        addresses: [ctx.pAddressBech32]
      })

      if (!params.amount) {
        throw new Error(
          `amount is required for exportPC transaction. Use --amount <amount> to specify the amount`
        )
      }

      let exportTx: UnsignedTx
      if (isEtnaForkActive) {
        exportTx = pvm.e.newExportTx(
          {
            destinationChainId: getChainIdFromContext('C', context),
            feeState,
            fromAddressesBytes: [futils.bech32ToBytes(ctx.pAddressBech32)],
            outputs: [
              TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount), [
                futils.bech32ToBytes(ctx.pAddressBech32)
              ])
            ],
            utxos
          },
          context
        )
      } else {
        exportTx = pvm.newExportTx(
          context,
          getChainIdFromContext('C', context),
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          utxos,
          [
            TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount), [
              futils.bech32ToBytes(ctx.pAddressBech32)
            ])
          ]
        )
      }
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
        addresses: [ctx.cAddressBech32]
      })

      const exportTx = evm.newImportTx(
        context,
        futils.hexToBuffer(ctx.cAddressHex),
        [futils.bech32ToBytes(ctx.pAddressBech32)],
        utxos,
        getChainIdFromContext('P', context),
        BigInt(params.fee)
      )
      return exportTx
    }
    case 'stake': {
      if (!params.amount) {
        throw new Error(
          `amount is required for stake transaction. Use --amount <amount> to specify the amount`
        )
      }
      if (!params.nodeId) {
        throw new Error(
          `nodeId is required for stake transaction. Use --node-id <nodeId> to specify the node id`
        )
      }
      if (!params.endTime) {
        throw new Error(
          `endTime is required for stake transaction. Use --end-time <endTime> to specify the end time`
        )
      }
      if (!params.popBlsPublicKey) {
        throw new Error(
          `popBlsPublicKey is required for stake transaction. Use --pop-bls-public-key <popBlsPublicKey> to specify the BLS public key`
        )
      }
      if (!params.popBlsSignature) {
        throw new Error(
          `popBlsSignature is required for stake transaction. Use --pop-bls-signature <popBlsSignature> to specify the BLS signature`
        )
      }
      const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32] })
      const start = BigInt(adjustStartTimeForDefi(params.startTime))
      const end = BigInt(params.endTime)
      const nodeId = params.nodeId
      const publicKey = futils.hexToBuffer(params.popBlsPublicKey)
      const signature = futils.hexToBuffer(params.popBlsSignature)

      let stakeTx: UnsignedTx
      if (isEtnaForkActive) {
        stakeTx = pvm.e.newAddPermissionlessValidatorTx(
          {
            end,
            delegatorRewardsOwner: [futils.bech32ToBytes(ctx.pAddressBech32)],
            feeState,
            fromAddressesBytes: [futils.bech32ToBytes(ctx.pAddressBech32)],
            nodeId,
            publicKey,
            rewardAddresses: [futils.bech32ToBytes(ctx.pAddressBech32)],
            shares: Number(params.delegationFee) * 1e4, // default fee is 10%
            signature,
            start,
            subnetId: networkIDs.PrimaryNetworkID.toString(),
            utxos,
            weight: BigInt(params.amount)
          },
          context
        )
      } else {
        stakeTx = pvm.newAddPermissionlessValidatorTx(
          context,
          utxos,
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          nodeId,
          networkIDs.PrimaryNetworkID.toString(),
          start,
          end,
          BigInt(params.amount),
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          Number(params.delegationFee) * 1e4, // default fee is 10%
          undefined,
          1,
          0n,
          publicKey,
          signature
        )
      }
      return stakeTx
    }
    case 'delegate': {
      if (!params.amount) {
        throw new Error(
          `amount is required for stake transaction. Use --amount <amount> to specify the amount`
        )
      }
      if (!params.nodeId) {
        throw new Error(
          `nodeId is required for stake transaction. Use --node-id <nodeId> to specify the node id`
        )
      }
      if (!params.endTime) {
        throw new Error(
          `endTime is required for stake transaction. Use --end-time <endTime> to specify the end time`
        )
      }

      const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32] })
      const start = BigInt(adjustStartTimeForDefi(params.startTime))
      const end = BigInt(params.endTime)
      const nodeId = params.nodeId

      let delegateTx: UnsignedTx
      if (isEtnaForkActive) {
        delegateTx = pvm.e.newAddPermissionlessDelegatorTx(
          {
            end,
            feeState,
            fromAddressesBytes: [futils.bech32ToBytes(ctx.pAddressBech32)],
            nodeId,
            rewardAddresses: [futils.bech32ToBytes(ctx.pAddressBech32)],
            start,
            subnetId: networkIDs.PrimaryNetworkID.toString(),
            utxos,
            weight: BigInt(params.amount)
          },
          context
        )
      } else {
        delegateTx = pvm.newAddPermissionlessDelegatorTx(
          context,
          utxos,
          [futils.bech32ToBytes(ctx.pAddressBech32)],
          nodeId,
          networkIDs.PrimaryNetworkID.toString(),
          start,
          end,
          BigInt(params.amount),
          [futils.bech32ToBytes(ctx.pAddressBech32)]
        )
      }
      return delegateTx
    }
    case 'transfer': {
      if (!params.amount) {
        throw new Error(
          `amount is required for transfer transaction. Use --amount <amount> to specify the amount`
        )
      }
      if (!params.transferAddress) {
        throw new Error(
          `transferAddress is required for transfer transaction. Use --transfer-address <address> to specify the address`
        )
      }
      const { utxos } = await pvmapi.getUTXOs({ addresses: [ctx.pAddressBech32] })
      const senderPAddressBytes = futils.bech32ToBytes(ctx.pAddressBech32)
      const recipientPAddressBytes = futils.bech32ToBytes(params.transferAddress)

      let transferTx: UnsignedTx
      if (isEtnaForkActive) {
        transferTx = pvm.e.newBaseTx(
          {
            feeState,
            fromAddressesBytes: [senderPAddressBytes],
            outputs: [
              TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount), [
                recipientPAddressBytes
              ])
            ],
            utxos
          },
          context
        )
      } else {
        transferTx = pvm.newBaseTx(context, [senderPAddressBytes], utxos, [
          TransferableOutput.fromNative(context.avaxAssetID, BigInt(params.amount), [
            recipientPAddressBytes
          ])
        ])
      }
      return transferTx
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
    case 'delegate':
    case 'transfer': {
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
  params: FlareTxParams
): Promise<{ txid: string; usedFee?: string }> {
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
  } else if (transactionType === 'transfer') {
    return await internalTransfer(ctx, params)
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
    const publicKey = await ledger.getPublicKey(derivationPath, options.network as string)
    const address = await ledger.verifyCAddress(derivationPath)
    const ethAddress = publicKeyToEthereumAddressString(publicKey)
    ctxFile = {
      wallet: 'ledger',
      publicKey,
      ethAddress,
      flareAddress: address,
      network: options.network as string,
      derivationPath
    }
  } else if (options.publicKey) {
    if (!validatePublicKey(options.publicKey as string)) return logError('Invalid public key')
    ctxFile = {
      wallet: 'publicKey',
      publicKey: options.publicKey as string,
      network: options.network as string
    }
    if (options.vaultId) {
      ctxFile = {
        ...ctxFile,
        vaultId: options.vaultId as string
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
  if (!ctx.publicKey) {
    logError('Public key is not set in the context file')
    return
  }
  const [pubX, pubY] = ctx.publicKey
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
  if (!ctx.cAddressHex) {
    throw new Error('C-chain address is not set in the context file')
  }
  if (!ctx.pAddressBech32) {
    throw new Error('P-chain bech32 address is not set in the context file')
  }
  let cbalance = (await ctx.web3.eth.getBalance(ctx.cAddressHex)).toString()
  let pbalance = // NOTE: HRP seems the right string for this function
    (await getPBalance(ctx.config.hrp, ctx.pAddressBech32)).toString()
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
 * @description Logs the validator information regrading current validators
 * @param ctx - the context file
 */
export async function logValidatorInfo(ctx: Context): Promise<void> {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const current = await pvmapi.getCurrentValidators()
  //const current = await ctx.pchain.getCurrentValidators();
  const fcurrent = JSON.stringify(current.validators, null, 2)
  logInfo(`Validators on the network "${ctx.config.hrp}"`)
  log(fcurrent)
}

/**
 * @description Logs mirror fund details
 * @param ctx - context
 */
export async function logMirrorFundInfo(ctx: Context): Promise<void> {
  const mirroFundDetails = await fetchMirrorFunds(ctx)
  logInfo(`Mirror fund details on the network "${ctx.config.hrp}"`)
  log(JSON.stringify(mirroFundDetails, null, 2))
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
      // ethereum or avalanche app
      if (!request.unsignedTxHash) {
        throw new Error(
          'unsignedTxHash is required for blind signing with ethereum or avalanche app'
        )
      }
      return ledger.signHash(_derivationPath, request.unsignedTxHash)
    } else {
      try {
        return await ledger.sign(_derivationPath, request.unsignedTxHex)
      } catch (e) {
        if (
          typeof e === 'object' &&
          e &&
          'errorMessage' in e &&
          typeof e.errorMessage === 'string' &&
          e.errorMessage.includes('Data is invalid : Unrecognized error code')
        ) {
          logInfo(
            `Non-blind signing for transaction type ${transactionType} on network ${ctx.network} is not supported by the Flare app. Blind signing with signing only the hash will be used instead.`
          )
          if (!request.unsignedTxHash) {
            throw new Error('unsignedTxHash is required for ledger signing')
          }
          return ledger.signHash(_derivationPath, request.unsignedTxHash)
        } else {
          throw new Error(`Ledger signing error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }
  if (!ctx.publicKey) {
    throw new Error('Public key is not set in the context file')
  }
  if (transactionType === 'exportCP') {
    if (!params.amount) {
      throw new Error(
        `amount is required for exportCP transaction. Use --amount <amount> to specify the amount`
      )
    }
    const amount = toBN(params.amount)
    if (!amount) throw new Error(`Amount is invalid: ${params.amount}`)
    let tp: ExportCTxParams = {
      amount: amount,
      exportFee: toBN(params.fee),
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey)
    }
    await flare.exportCP(tp, sign)
    return
  } else if (transactionType === 'importCP') {
    let tp: ImportPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey)
    }
    await flare.importCP(tp, sign)
    return
  } else if (transactionType === 'exportPC') {
    let tp: ExportPTxParams = {
      amount: toBN(params.amount),
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey)
    }
    await flare.exportPC(tp, sign)
    return
  } else if (transactionType === 'importPC') {
    let tp: ImportCTxParams = {
      importFee: toBN(params.fee),
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey)
    }
    await flare.importPC(tp, sign)
    return
  } else if (transactionType === 'stake') {
    logInfo('Creating stake transaction...')
    if (!params.amount) {
      throw new Error(
        `amount is required for stake transaction. Use --amount <amount> to specify the amount`
      )
    }
    if (!params.nodeId) {
      throw new Error(
        `nodeId is required for stake transaction. Use --node-id <nodeId> to specify the node id`
      )
    }
    if (!params.endTime) {
      throw new Error(
        `endTime is required for stake transaction. Use --end-time <endTime> to specify the end time`
      )
    }
    if (!params.popBlsPublicKey) {
      throw new Error(
        `popBlsPublicKey is required for stake transaction. Use --pop-bls-public-key <popBlsPublicKey> to specify the BLS public key`
      )
    }
    if (!params.popBlsSignature) {
      throw new Error(
        `popBlsSignature is required for stake transaction. Use --pop-bls-signature <popBlsSignature> to specify the BLS signature`
      )
    }
    let tp: ValidatorPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey),
      delegationFee: Number(params.delegationFee) * 1e4, // default fee is 10%
      nodeId: params.nodeId,
      popBLSPublicKey: futils.hexToBuffer(params.popBlsPublicKey),
      popBLSSignature: futils.hexToBuffer(params.popBlsSignature),
      amount: new BN(params.amount),
      startTime: new BN(adjustStartTime(params.startTime)),
      endTime: new BN(params.endTime),

      // unnecessary?
      useConsumableUTXOs: false,
      customUTXOs: []
    }
    await flare.addValidator(tp, sign, true)
    return
  } else if (transactionType === 'delegate') {
    logInfo('Creating delegate transaction...')
    if (!params.amount) {
      throw new Error(
        `amount is required for delegate transaction. Use --amount <amount> to specify the amount`
      )
    }
    if (!params.nodeId) {
      throw new Error(
        `nodeId is required for delegate transaction. Use --node-id <nodeId> to specify the node id`
      )
    }
    if (!params.endTime) {
      throw new Error(
        `endTime is required for delegate transaction. Use --end-time <endTime> to specify the end time`
      )
    }
    let tp: DelegatorPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey),
      nodeId: params.nodeId,
      amount: new BN(params.amount),
      startTime: new BN(adjustStartTime(params.startTime)),
      endTime: new BN(params.endTime),

      // unnecessary?
      useConsumableUTXOs: false,
      customUTXOs: []
    }
    // let presubmit =  null (): Promise<boolean> => new Promise(() => false)
    await flare.addDelegator(tp, sign, true)
    return
  } else if (transactionType === 'transfer') {
    logInfo('Creating transfer transaction...')
    if (!params.amount) {
      throw new Error(
        `amount is required for transfer transaction. Use --amount <amount> to specify the amount`
      )
    }
    if (!params.transferAddress) {
      throw new Error(
        `transferAddress is required for transfer transaction. Use --transfer-address <address> to specify the address`
      )
    }
    const tp: TransferPTxParams = {
      network: ctx.config.hrp,
      type: transactionType,
      publicKey: getPublicKeyFromPair(ctx.publicKey),
      amount: params.amount,
      recipientAddress: params.transferAddress
    }
    await flare.internalTransfer(tp, sign)
    return
  } else {
    throw new Error(`Unknown transaction type ${transactionType}`)
  }
}

async function cliBuildAndSaveUnsignedTxJson(
  transactionType: string,
  ctx: Context,
  id: string,
  params: FlareTxParams
): Promise<void> {
  const unsignedTx: UnsignedTx = await buildUnsignedTx(transactionType, ctx, params)
  const txBuffer = Buffer.from(unsignedTx.toBytes()).toString('hex')
  const txMessage = Buffer.from(messageHashFromUnsignedTx(unsignedTx)).toString('hex')
  const unsignedTxJson: UnsignedTxJson = {
    transactionType,
    signatureRequests: [
      {
        message: txMessage,
        signer: ''
      }
    ],
    unsignedTransactionBuffer: txBuffer,
    serialization: JSON.stringify(unsignedTx.toJSON())
  }
  const forDefiHash = saveUnsignedTxJson(unsignedTxJson, id)
  logSuccess(`Unsigned transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}

async function cliSendSignedTxJson(ctx: Context, id: string): Promise<void> {
  if (isAlreadySentToChain(id)) {
    throw new Error('Tx already sent to chain')
  }
  const signedTxnJson = readSignedTxJson(id)
  let chainTxId
  if (signedTxnJson.transactionType === 'EVM') {
    chainTxId = await sendSignedEvmTransaction(ctx, id)
  } else {
    chainTxId = await sendSignedTxJson(ctx, signedTxnJson)
  }
  addFlagForSentSignedTx(id)
  logSuccess(`Signed transaction ${id} with hash ${chainTxId} sent to the node`)
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
  evmTx: boolean = false
): Promise<void> {
  const txid = await sendToForDefi(transaction, ctx, evmTx)
  logSuccess(`Transaction with hash ${txid} sent to the ForDefi`)
}

async function fetchForDefiTx(transaction: string, evmTx: boolean = false): Promise<void> {
  if (isAlreadySentToChain(transaction)) {
    throw new Error('Tx already sent to chain')
  }
  const signature = await getSignature(transaction, evmTx)
  logSuccess(`Success! Signature: ${signature}`)
}

async function buildUnsignedWithdrawalTxJson(
  ctx: Context,
  to: string,
  amount: number,
  id: string,
  nonce: number
): Promise<void> {
  const forDefiHash = await createWithdrawalTransaction(ctx, to, amount, id, nonce)
  logSuccess(`Transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}

async function buildUnsignedOptOutTxJson(ctx: Context, id: string, nonce: number): Promise<void> {
  const forDefiHash = await createOptOutTransaction(ctx, id, nonce)
  logSuccess(`Transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}

async function processClaimTx(
  options: OptionValues,
  id: string,
  amount: number,
  recipient: string,
  wrap: boolean,
  nonce: number
): Promise<void> {
  const ctx = await contextFromOptions(options)
  const rawTx = await createClaimTransaction(ctx, amount, recipient, wrap, nonce)
  if (options.getHacked) {
    if (!ctx.cAddressHex || !ctx.privkHex) {
      throw new Error('cAddressHex or private key is undefined or null')
    }
    const txId = await signEvmTransaction('privateKey', ctx, rawTx)
    logSuccess(`Transaction with hash ${txId} built and sent to the network`)
  } else if (options.ledger) {
    const txId = await signEvmTransaction('ledger', ctx, rawTx, options.derivationPath as string)
    logSuccess(`Transaction with hash ${txId} built and sent to the network`)
  } else {
    // ForDefi
    const forDefiHash = saveUnsignedClaimTx(rawTx, id)
    logSuccess(`Transaction ${id} constructed`)
    logSuccess(`ForDefi hash: ${forDefiHash}`)
  }
}

async function buildUnsignedSetClaimExecutorsTxJson(
  ctx: Context,
  id: string,
  executors: string[],
  nonce: number
): Promise<void> {
  const forDefiHash = await createSetClaimExecutorsTransaction(ctx, id, executors, nonce)
  logSuccess(`Transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}

async function buildUnsignedSetAllowedClaimRecipientsTxJson(
  ctx: Context,
  id: string,
  recipients: string[],
  nonce: number
): Promise<void> {
  const forDefiHash = await createSetAllowedClaimRecipientsTransaction(ctx, id, recipients, nonce)
  logSuccess(`Transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}
async function buildUnsignedCustomCChainTxJson(
  ctx: Context,
  id: string,
  data: string,
  to: string,
  value: string,
  nonce: number
): Promise<void> {
  const forDefiHash = await createCustomCChainTransaction(ctx, id, to, data, value, nonce)
  logSuccess(`Transaction ${id} constructed`)
  logSuccess(`ForDefi hash: ${forDefiHash}`)
}
