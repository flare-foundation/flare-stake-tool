import fs from 'fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { BN } from 'bn.js'
import {
  ConnectWalletInterface,
  Context,
  ContextFile,
  DelegationDetailsInterface,
  DerivedAddress,
  ScreenConstantsInterface,
  TransferDetailsInterface
} from '../interfaces'
import { contextEnv, getContext, getNetworkConfig, isDurango } from '../context'
import { prompts } from './prompts'
import {
  publicKeyToBech32AddressString,
  publicKeyToEthereumAddressString,
  waitFinalize
} from '../utils'
import { cli, initCtxJsonFromOptions, networkTokenSymbol } from '../cli'
import * as ledger from '../ledger'
import { logInfo } from '../output'
import { getStateOfRewards } from '../forDefi/evmTx'
import Web3 from 'web3'

const DEFAULT_EVM_TX_FEE = new BN(1)
const DEFAULT_EVM_TX_BASE_FEE = new BN(25)

/***
 * @description Handles all operations pertaining to the interactive CLL. Creates a list of arguments and internally calls the commander based CLI after taking the relevant inputs from the user.
 * @param baseargv List of base arguments passed to the application to invoke the interactive CLI
 * @returns {void}
 */
export async function interactiveCli(baseargv: string[]) {
  let initialised = false
  let walletProperties: ConnectWalletInterface | null = null
  while (true) {
    if (!initialised) {
      walletProperties = await connectWallet()
      initialised = true
    }
    if (!walletProperties) {
      throw new Error('Cannot connect to wallet')
    }
    const task = String(await selectTask())
    const program = new Command('Flare Stake Tool')
    cli(program)

    // First 4 info functions
    if (["addresses", "balance", "network", "validators"].includes(task)) {
      if (
        walletProperties.wallet == "ledger"
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          task,
          `--ctx-file=ctx.json`
        ]
        await program.parseAsync(argsInfo)
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.path &&
        walletProperties.network
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          task,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        await program.parseAsync(argsInfo)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }

    // Functions for export and import to move funds between chains
    else if (task == "CP" || task == "PC") {
      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          publicKey
        } = readInfoFromCtx('ctx.json')
        if (ctxNetwork && ctxDerivationPath) {
          const amount = await prompts.amount()
          const argsExport = [
            ...baseargv.slice(0, 2),
            'transaction',
            `export${task}`,
            '-a',
            `${amount.amount}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            '--network',
            `${ctxNetwork}`,
            '--ledger'
          ]
          // ask for fees if its exportCP transaction
          if (task.slice(0, 1) == 'C') {
            const exportFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
            argsExport.push('-f', `${exportFees.fees}`)
            // for exportCP we wait for the finalization before doing import
            await waitFinalize<any>(
              getContext(ctxNetwork, publicKey),
              program.parseAsync(argsExport)
            )
            console.log(chalk.green('Transaction finalized!'))
          } else {
            await program.parseAsync(argsExport)
          }
          const argsImport = [
            ...baseargv.slice(0, 2),
            'transaction',
            `import${task}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            '--network',
            `${ctxNetwork}`,
            '--ledger'
          ]
          // ask for fees if its importTxPC
          if (task.slice(0, 1) == 'P') {
            const importFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
            argsImport.push('-f', `${importFees.fees}`)
          }
          console.log('Please approve import transaction')
          await program.parseAsync(argsImport)
        } else {
          console.log('Missing params in ctx file')
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {
        // explicitly throw error when ctx.json doesn't exist
        const amount = await prompts.amount()
        const argsExport = [
          ...baseargv.slice(0, 2),
          'transaction',
          `export${task}`,
          '-a',
          `${amount.amount}`,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        // ask for fees if its exportCP transaction
        if (task.slice(0, 1) == 'C') {
          const exportFees = await prompts.baseFee(DEFAULT_EVM_TX_BASE_FEE)
          argsExport.push('-f', `${exportFees.baseFee}`)
          await waitFinalize<any>(
            contextEnv(walletProperties.path, walletProperties.network),
            program.parseAsync(argsExport)
          )
          console.log(chalk.green('Transaction finalized!'))
        } else {
          await program.parseAsync(argsExport)
        }
        const argsImport = [
          ...baseargv.slice(0, 2),
          'transaction',
          `import${task}`,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        // ask for fees if its importTxPC
        if (task.slice(0, 1) == 'P') {
          const exportFees = await prompts.baseFee(DEFAULT_EVM_TX_BASE_FEE)
          argsImport.push('-f', `${exportFees.baseFee}`)
        }
        await program.parseAsync(argsImport)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }

    else if (task === 'transfer') {
      // transfer funds between p-chain addresses
      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          publicKey: ctxPublicKey
        } = readInfoFromCtx('ctx.json')
        const ctxPAddress = 'P-' + publicKeyToBech32AddressString(ctxPublicKey, ctxNetwork)
        if (ctxNetwork && ctxDerivationPath && ctxPAddress) {
          const { amount, transferAddress } = await getDetailsForTransfer(task)
          if (
            ctxNetwork &&
            ctxDerivationPath
          ) {
            const argsValidator = [
              ...baseargv.slice(0, 2),
              'transaction',
              task,
              '-a',
              `${amount}`,
              '--transfer-address',
              `${transferAddress}`,
              '--blind',
              '--derivation-path',
              ctxDerivationPath,
              `--network`,
              `${ctxNetwork}`,
              '--ledger'
            ]
            await program.parseAsync(argsValidator)
          } else {
            console.log('Missing values for certain params')
          }
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {

        const { amount, transferAddress } = await getDetailsForTransfer(task)
        const argsValidator = [
          ...baseargv.slice(0, 2),
          'transaction',
          task,
          `--network=${walletProperties.network}`,
          '-a',
          `${amount}`,
          '--transfer-address',
          `${transferAddress}`,
          `--env-path=${walletProperties.path}`,
          '--get-hacked',
        ]
        await program.parseAsync(argsValidator)
      } else {
        console.log('only pvt key and ledger supported for staking right now')
      }
    }

    // Adding a validator
    else if ("stake" == task) {
      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          publicKey: ctxPublicKey
        } = readInfoFromCtx('ctx.json')
        const ctxPAddress = 'P-' + publicKeyToBech32AddressString(ctxPublicKey, ctxNetwork)
        const ctxCAddress = publicKeyToEthereumAddressString(ctxPublicKey)
        if (ctxNetwork && ctxDerivationPath && ctxPAddress && ctxCAddress) {

          const {
            amount,
            nodeId,
            startTime,
            endTime,
            delegationFee,
            popBLSPublicKey,
            popBLSSignature
          } = await getDetailsForDelegation(task, isDurango(ctxNetwork))
          if (
            ctxNetwork &&
            ctxDerivationPath &&
            delegationFee &&
            popBLSPublicKey &&
            popBLSSignature
          ) {
            const argsValidator = [
              ...baseargv.slice(0, 2),
              'transaction',
              task,
              '-n',
              `${nodeId}`,
              '-a',
              `${amount}`,
              '-s',
              `${startTime}`,
              '-e',
              `${endTime}`,
              '--delegation-fee',
              `${delegationFee}`,
              '--blind',
              '--derivation-path',
              ctxDerivationPath,
              `--network`,
              `${ctxNetwork}`,
              `--pop-bls-public-key`,
              popBLSPublicKey,
              `--pop-bls-signature`,
              popBLSSignature,
              '--ledger'
            ]
            await program.parseAsync(argsValidator)
          } else {
            console.log('Missing values for certain params')
          }
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {

        const {
          amount,
          nodeId,
          startTime,
          endTime,
          delegationFee,
          popBLSPublicKey,
          popBLSSignature
        } = await getDetailsForDelegation(task, isDurango(walletProperties.network))
        const argsValidator = [
          ...baseargv.slice(0, 2),
          'transaction',
          task,
          '-n',
          `${nodeId}`,
          `--network=${walletProperties.network}`,
          '-a',
          `${amount}`,
          '-s',
          `${startTime}`,
          '-e',
          `${endTime}`,
          '--delegation-fee',
          `${delegationFee}`,
          `--env-path=${walletProperties.path}`,
          '--get-hacked',
          `--pop-bls-public-key`,
          popBLSPublicKey!,
          `--pop-bls-signature`,
          popBLSSignature!
        ]
        await program.parseAsync(argsValidator)
      } else {
        console.log('only pvt key and ledger supported for staking right now')
      }
    }

    // Delegating to a Validator
    else if ("delegate" == task) {
      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          ethAddress: ctxCAddress,
          // publicKey: ctxPublicKey,
          flareAddress: ctxPAddress
        } = readInfoFromCtx('ctx.json')
        if (ctxNetwork && ctxDerivationPath && ctxPAddress && ctxCAddress) {

          const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(
            task, isDurango(ctxNetwork)
          )
          const argsDelegate = [
            ...baseargv.slice(0, 2),
            'transaction',
            task,
            '-n',
            `${nodeId}`,
            '-a',
            `${amount}`,
            '-s',
            `${startTime}`,
            '-e',
            `${endTime}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            `--network`,
            `${ctxNetwork}`,
            '--ledger'
          ]
          await program.parseAsync(argsDelegate)
        } else {
          console.log('Missing params in ctx file')
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {

        const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(
          task, isDurango(walletProperties.network)
        )
        const argsDelegate = [
          ...baseargv.slice(0, 2),
          'transaction',
          task,
          '-n',
          `${nodeId}`,
          `--network=${walletProperties.network}`,
          '-a',
          `${amount}`,
          '-s',
          `${startTime}`,
          '-e',
          `${endTime}`,
          `--env-path=${walletProperties.path}`,
          '--get-hacked'
        ]
        await program.parseAsync(argsDelegate)
      } else {
        console.log('only private key and ledger are supported for delegation')
      }
    }

    // Mirror funds
    else if ("mirror" == task) {
      if (
        walletProperties.wallet == "ledger"
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          task,
          `--ctx-file=ctx.json`
        ]
        await program.parseAsync(argsInfo)
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.path &&
        walletProperties.network
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          task,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        await program.parseAsync(argsInfo)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }
    else if ("import" == task) {
      const importDestChain = await prompts.importTrxType()
      let trxType
      if (importDestChain.type == 'P') trxType = 'CP'
      if (importDestChain.type == 'C') trxType = 'PC'

      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const { network: ctxNetwork, derivationPath: ctxDerivationPath } =
          readInfoFromCtx('ctx.json')
        if (ctxNetwork && ctxDerivationPath) {
          const argsImport = [
            ...baseargv.slice(0, 2),
            'transaction',
            `import${trxType}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            `--network=${ctxNetwork}`,
            '--ledger'
          ]
          // ask for fees if its importTxPC
          if (importDestChain.type == 'C') {
            const importFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
            argsImport.push('-f', `${importFees.fees}`)
          }
          console.log('Please approve import transaction')
          await program.parseAsync(argsImport)
        } else {
          console.log('Missing params in ctx file')
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {
        const argsImport = [
          ...baseargv.slice(0, 2),
          'transaction',
          `import${trxType}`,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        // ask for fees if its importTxPC
        if (importDestChain.type == 'C') {
          const importFees = await prompts.baseFee(DEFAULT_EVM_TX_BASE_FEE)
          argsImport.push('-f', `${importFees.baseFee}`)
        }
        console.log('Please approve import transaction')
        await program.parseAsync(argsImport)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }
    else if ("claim" == task) {
      if (walletProperties.wallet == "ledger" && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          ethAddress: ctxCAddress,
          // publicKey: ctxPublicKey,
          flareAddress: ctxPAddress
        } = readInfoFromCtx('ctx.json')
        const networkConfig = getNetworkConfig(ctxNetwork)
        const path = '/ext/bc/C/rpc'
        const port = networkConfig.port
        const ip = networkConfig.ip
        const protocol = networkConfig.protocol
        const iport = port ? `${ip}:${port}` : `${ip}`
        const rpcurl = `${protocol}://${iport}`
        const web3 = new Web3(`${rpcurl}${path}`)
        if (ctxNetwork && ctxDerivationPath && ctxPAddress && ctxCAddress) {
          const { unclaimedRewards, totalRewards, claimedRewards } = await getStateOfRewards(web3, ctxCAddress)
          console.log(chalk.yellow(
            `State of rewards for ${ctxCAddress}:\n` +
            `Total rewards: ${totalRewards} ${networkTokenSymbol[ctxNetwork]}\n` +
            `Claimed rewards: ${claimedRewards} ${networkTokenSymbol[ctxNetwork]}\n` +
            `Unclaimed rewards: ${unclaimedRewards} ${networkTokenSymbol[ctxNetwork]}`
          ))
          if (Number(unclaimedRewards) === 0) {
            console.log(chalk.green('Nothing to claim!'))
            break
          }
          const claimAll = await prompts.claimAllUnclaimed(unclaimedRewards, networkTokenSymbol[networkConfig.hrp]
          );
          const amount = claimAll.claimAllUnclaimed ? undefined : (await prompts.claimAmount()).claimAmount
          const wrapRewards = await prompts.wrapRewards()
          const recipientAddress = await prompts.recipientAddress(ctxCAddress)
          const argsDelegate = [
            ...baseargv.slice(0, 2),
            'claim',
            ...(amount ? [`-a`] : []),
            ...(amount ? [`${amount}`] : []),
            '-r',
            `${recipientAddress.recipientAddress}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            `--network`,
            `${ctxNetwork}`,
            '--ledger',
            ...(wrapRewards.wrapRewards ? ['-w'] : [])
          ]
          await program.parseAsync(argsDelegate)
        } else {
          console.log('Missing params in ctx file')
        }
      } else if (
        walletProperties.wallet == "privateKey" &&
        walletProperties.network &&
        walletProperties.path
      ) {
        const ctx: Context = contextEnv(walletProperties.path, walletProperties.network)
        const ctxCAddress = ctx.cAddressHex
        const { unclaimedRewards, totalRewards, claimedRewards } = await getStateOfRewards(ctx.web3, ctxCAddress!)
        const symbol = networkTokenSymbol[ctx.config.hrp]
        console.log(chalk.yellow(
          `State of rewards for ${ctxCAddress}:\n` +
          `Total rewards: ${totalRewards} ${symbol}\n` +
          `Claimed rewards: ${claimedRewards} ${symbol}\n` +
          `Unclaimed rewards: ${unclaimedRewards} ${symbol}`
        ))
        if (Number(unclaimedRewards) === 0) {
          console.log(chalk.green('Nothing to claim!'))
          break
        }
        const claimAll = await prompts.claimAllUnclaimed(unclaimedRewards, symbol
        );
        const amount = claimAll.claimAllUnclaimed ? undefined : (await prompts.claimAmount()).claimAmount
        const wrapRewards = await prompts.wrapRewards()
        const recipientAddress = await prompts.recipientAddress(ctx.cAddressHex)
        const argsDelegate = [
          ...baseargv.slice(0, 2),
          'claim',
          ...(amount ? [`-a`] : []),
          ...(amount ? [`${amount}`] : []),
          '-r',
          `${recipientAddress.recipientAddress}`,
          `--env-path=${walletProperties.path}`,
          '--get-hacked',
          `--network=${walletProperties.network}`,
          ...(wrapRewards.wrapRewards ? ['-w'] : [])
        ]
        await program.parseAsync(argsDelegate)
      } else {
        console.log('only private key and ledger are supported')
      }
    }
    // exit the interactive cli
    else if ("quit" == task) {
      // exit the application
      logInfo('Exiting interactive cli.')
      process.exit(0)
    } else {
      console.log('Task not supported')
    }
  }
}

async function connectWallet(): Promise<ConnectWalletInterface> {
  const walletPrompt = await prompts.connectWallet()
  const wallet: string = walletPrompt.wallet

  if (wallet == "privateKey") {
    const pvtKeyPath = await prompts.pvtKeyPath()
    const path = pvtKeyPath.pvtKeyPath
    // check if the file exists
    if (!fileExists(path)) {
      throw new Error("File doesn't exist")
    }
    const network = await selectNetwork()
    // check if the file is a valid private key
    contextEnv(path, network)
    return { wallet, path, network }
  } else if (wallet == "ledger") {
    const isCreateCtx = await getCtxStatus(wallet)
    let network
    if (isCreateCtx) {
      network = await selectNetwork()
      const selectedDerivationPath = await selectDerivationPath(network)

      const optionsObject = {
        network,
        blind: false,
        ctxFile: 'ctx.json',
        ledger: true
      }
      await initCtxJsonFromOptions(optionsObject, selectedDerivationPath)
    }

    return { wallet }
  } else {
    return { wallet }
  }
}

async function selectNetwork() {
  const network = await prompts.selectNetwork()
  return network.network
}

async function selectTask(): Promise<keyof ScreenConstantsInterface> {
  const task = await prompts.selectTask()
  return task.task
}

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK)
    return true
  } catch (error) {
    return false
  }
}

function readInfoFromCtx(_filePath: string): ContextFile {
  const ctxContent = fs.readFileSync('ctx.json', 'utf-8')
  const ctxData = JSON.parse(ctxContent) as ContextFile

  const wallet = ctxData.wallet
  const publicKey = ctxData.publicKey
  const network = ctxData.network
  const ethAddress = publicKeyToEthereumAddressString(publicKey)
  const flareAddress = 'P-' + publicKeyToBech32AddressString(publicKey, network)
  const derivationPath = ctxData.derivationPath || undefined
  const vaultId = ctxData.vaultId || undefined

  return {
    wallet,
    publicKey,
    network,
    ethAddress,
    flareAddress,
    derivationPath,
    vaultId
  }
}

function createChoicesFromAddress(pathList: DerivedAddress[]): string[] {
  const choiceList: string[] = []

  for (let i = 0; i < 10; i++) {
    const choice = pathList[i].ethAddress
    choiceList.push(`${i + 1}. ${choice}`)
  }

  return choiceList
}

async function getCtxStatus(wallet: string): Promise<boolean> {
  let isCreateCtx = true
  const isFileExist: boolean = fileExists('ctx.json')

  if (isFileExist) {
    const {
      wallet: ctxWallet,
      network: ctxNetwork,
      publicKey: ctxPublicKey,
      ethAddress: ctxEthAddress,
      vaultId: ctxVaultId
    } = readInfoFromCtx('ctx.json')
    if (wallet !== ctxWallet) {
      deleteFile()
      return isCreateCtx
    }
    console.log(
      chalk.magenta('You already have an existing Ctx file with the following parameters:')
    )
    console.log(chalk.hex('#FFA500')('Public Key:'), ctxPublicKey)
    console.log(chalk.hex('#FFA500')('Network:'), ctxNetwork)
    if (ctxEthAddress) {
      console.log(chalk.hex('#FFA500')('Eth Address:'), ctxEthAddress)
    }
    if (ctxVaultId) {
      console.log(chalk.hex('#FFA500')('Vault Id:'), ctxVaultId)
    }
    const getUserChoice = await prompts.ctxFile()
    const isContinue: boolean = getUserChoice.isContinue

    if (isContinue) {
      isCreateCtx = false
    } else {
      deleteFile()
    }
  }

  return isCreateCtx
}

function deleteFile() {
  try {
    fs.unlinkSync('ctx.json')
    console.log('File "ctx.json" has been deleted.')
  } catch (error) {
    console.error('An error occurred while deleting the file:', error)
  }
}

async function getDetailsForDelegation(task: string, isDurango: boolean): Promise<DelegationDetailsInterface> {
  const amount = await prompts.amount()
  const nodeId = await prompts.nodeId()
  let startTime: string = '0'
  if (!isDurango) {
    const { time } = await prompts.unixTime('start')
    startTime = time
  }
  const { time: endTime } = await prompts.unixTime('end')
  const delegationDetails = {
    amount: amount.amount,
    nodeId: nodeId.id,
    startTime: startTime,
    endTime: endTime
  }
  if (task == 'stake') {
    const fee = await prompts.delegationFee()
    const popBLSPublicKey = await prompts.popBLSPublicKey()
    const popBLSSignature = await prompts.popBLSSignature()
    return {
      ...delegationDetails,
      delegationFee: fee.fee,
      popBLSPublicKey: popBLSPublicKey.popBLSPublicKey,
      popBLSSignature: popBLSSignature.popBLSSignature
    }
  }
  return delegationDetails
}

async function getDetailsForTransfer(task: string): Promise<TransferDetailsInterface> {
  const { amount } = await prompts.amount()
  const { transferAddress } = await prompts.transferAddress()
  return { amount, transferAddress }
}

//async function getDetailsForValidation(task: string): Promise<DelegationDetailsInterface> {
//  const amount = await prompts.amount()
//  const nodeId = await prompts.nodeId()
//  const startTime = await prompts.unixTime('start')
//  const endTime = await prompts.unixTime('end')
//  const popBLSPublicKey = await prompts.popBLSPublicKey()
//  const popBLSSignature = await prompts.popBLSSignature()
//  const validationDetails = {
//    amount: amount.amount,
//    nodeId: nodeId.id,
//    startTime: startTime.time,
//    endTime: endTime.time,
//    popBLSPublicKey: popBLSPublicKey,
//    popBLSSignature: popBLSSignature
//  }
//  if (task == 'stake') {
//    const fee = await prompts.delegationFee()
//    return {
//    TODO: popBLS stuff?
//      ...validationDetails,
//      delegationFee: fee.fee
//    }
//  }
//  return delegationDetails
//}

export async function getPathsAndAddresses(
  network: string,
  derivationMode: string = 'default'
): Promise<DerivedAddress[]> {
  const LEDGER_LIVE_BASE_PATH = "m/44'/60'/" // Full: m/44'/60'/*'/0/0
  const BIP44_BASE_PATH = "m/44'/60'/0'/0/" // Full: m/44'/60'/0'/0/*
  const PATH_LIST = []

  for (let i = 0; i < 10; i++) {
    if (derivationMode == 'ledger_live') {
      PATH_LIST.push(LEDGER_LIVE_BASE_PATH + i + "'/0/0")
    } else {
      PATH_LIST.push(BIP44_BASE_PATH + i)
    }
  }

  const results: DerivedAddress[] = []

  for (const path of PATH_LIST) {
    const publicKey = await ledger.getPublicKey(path, network)

    const ethAddress = publicKeyToEthereumAddressString(publicKey)
    const derivedAddress: DerivedAddress = {
      ethAddress: ethAddress,
      derivationPath: path,
      publicKey: publicKey
    }
    results.push(derivedAddress)
  }

  return results
}

// queries user for their derivation path
async function selectDerivationPath(network: string) {
  const derivationTypePrompt = await prompts.derivationType()
  const derivation = derivationTypePrompt.derivation
  console.log('Fetching Addresses...')
  const pathList: DerivedAddress[] = await getPathsAndAddresses(network, derivation)
  const choiceList = createChoicesFromAddress(pathList)
  const selectedAddress = await prompts.selectAddress(choiceList)
  const selectedDerivedAddress = pathList.find((item) => item.ethAddress == selectedAddress.address)
  const selectedDerivationPath = selectedDerivedAddress?.derivationPath
  return selectedDerivationPath
}
