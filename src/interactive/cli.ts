import fs from 'fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { BN } from 'bn.js'
import {
  ConnectWalletInterface,
  ContextFile,
  DelegationDetailsInterface,
  DerivedAddress,
  ScreenConstantsInterface
} from '../interfaces'
import { taskConstants, walletConstants } from '../constants/screen'
import { contextEnv, getContext } from '../context'
import { prompts } from './prompts'
import {
  publicKeyToBech32AddressString,
  publicKeyToEthereumAddressString,
  waitFinalize
} from '../utils'
import { cli, initCtxJsonFromOptions } from '../cli'
import * as ledger from '../ledger'
import { logInfo } from '../output'

const DEFAULT_EVM_TX_FEE = new BN(1)

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
    const task = await selectTask()
    const program = new Command('Flare Stake Tool')
    await cli(program)

    // First 4 info functions
    if (Object.keys(taskConstants).slice(0, 4).includes(task.toString())) {
      if (
        walletProperties.wallet == Object.keys(walletConstants)[0]
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          taskConstants[task],
          `--ctx-file=ctx.json`
        ]
        await program.parseAsync(argsInfo)
      } else if (
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
        walletProperties.path &&
        walletProperties.network
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          taskConstants[task],
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
    else if (Object.keys(taskConstants).slice(4, 6).includes(task.toString())) {
      if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists('ctx.json')) {
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
            `export${taskConstants[task].slice(-2)}`,
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
          if (taskConstants[task].slice(0, 1) == 'C') {
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
            `import${taskConstants[task].slice(-2)}`,
            '--blind',
            '--derivation-path',
            ctxDerivationPath,
            '--network',
            `${ctxNetwork}`,
            '--ledger'
          ]
          // ask for fees if its importTxPC
          if (taskConstants[task].slice(0, 1) == 'P') {
            const importFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
            argsImport.push('-f', `${importFees.fees}`)
          }
          console.log('Please approve import transaction')
          await program.parseAsync(argsImport)
        } else {
          console.log('Missing params in ctx file')
        }
      } else if (
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
        walletProperties.network &&
        walletProperties.path
      ) {
        // // explicitly throw error when ctx.json doesn't exist
        const amount = await prompts.amount()
        const argsExport = [
          ...baseargv.slice(0, 2),
          'transaction',
          `export${taskConstants[task].slice(-2)}`,
          '-a',
          `${amount.amount}`,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        // ask for fees if its exportCP transaction
        if (taskConstants[task].slice(0, 1) == 'C') {
          const exportFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
          argsExport.push('-f', `${exportFees.fees}`)
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
          `import${taskConstants[task].slice(-2)}`,
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        // ask for fees if its importTxPC
        if (taskConstants[task].slice(0, 1) == 'P') {
          const exportFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
          argsImport.push('-f', `${exportFees.fees}`)
        }
        await program.parseAsync(argsImport)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }

    // Adding a validator
    else if (Object.keys(taskConstants)[6] == task.toString()) {
      if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists('ctx.json')) {
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
          } = await getDetailsForDelegation(taskConstants[task])
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
              taskConstants[task],
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
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
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
        } = await getDetailsForDelegation(taskConstants[task])
        const argsValidator = [
          ...baseargv.slice(0, 2),
          'transaction',
          taskConstants[task],
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
    else if (Object.keys(taskConstants)[7] == task.toString()) {
      if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists('ctx.json')) {
        const {
          network: ctxNetwork,
          derivationPath: ctxDerivationPath,
          ethAddress: ctxCAddress,
          // publicKey: ctxPublicKey,
          flareAddress: ctxPAddress
        } = readInfoFromCtx('ctx.json')
        if (ctxNetwork && ctxDerivationPath && ctxPAddress && ctxCAddress) {

          const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(
            taskConstants[task]
          )
          const argsDelegate = [
            ...baseargv.slice(0, 2),
            'transaction',
            taskConstants[task],
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
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
        walletProperties.network &&
        walletProperties.path
      ) {

        const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(
          taskConstants[task]
        )
        const argsDelegate = [
          ...baseargv.slice(0, 2),
          'transaction',
          taskConstants[task],
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
        console.log('only pvt key and ledger supported for delegation right now')
      }
    }

    // Mirror funds
    else if (Object.keys(taskConstants)[8] == task.toString()) {
      if (
        walletProperties.wallet == Object.keys(walletConstants)[0]
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          taskConstants[task],
          `--ctx-file=ctx.json`
        ]
        await program.parseAsync(argsInfo)
      } else if (
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
        walletProperties.path &&
        walletProperties.network
      ) {
        const argsInfo = [
          ...baseargv.slice(0, 2),
          'info',
          taskConstants[task],
          `--env-path=${walletProperties.path}`,
          `--network=${walletProperties.network}`,
          '--get-hacked'
        ]
        await program.parseAsync(argsInfo)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }
    else if (Object.keys(taskConstants)[9] == task.toString()) {
      const importDestChain = await prompts.importTrxType()
      let trxType
      if (importDestChain.type == 'P') trxType = 'CP'
      if (importDestChain.type == 'C') trxType = 'PC'

      if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists('ctx.json')) {
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
        walletProperties.wallet == Object.keys(walletConstants)[1] &&
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
          const importFees = await prompts.fees(DEFAULT_EVM_TX_FEE)
          argsImport.push('-f', `${importFees.fees}`)
        }
        console.log('Please approve import transaction')
        await program.parseAsync(argsImport)
      } else {
        console.log('Incorrect arguments passed!')
      }
    }

    // exit the interactive cli
    else if (Object.keys(taskConstants)[10] == task.toString()) {
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

  if (wallet == Object.keys(walletConstants)[1]) {
    const pvtKeyPath = await prompts.pvtKeyPath()
    const path = pvtKeyPath.pvtKeyPath
    const network = await selectNetwork()
    return { wallet, path, network }
  } else if (wallet == Object.keys(walletConstants)[0]) {
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
  const ctxData = JSON.parse(ctxContent)

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

async function createChoicesFromAddress(pathList: DerivedAddress[]) {
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
      chalk.magenta('You already have an existing Ctx file with the following parameters - ')
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

async function getDetailsForDelegation(task: string): Promise<DelegationDetailsInterface> {
  const amount = await prompts.amount()
  const nodeId = await prompts.nodeId()
  const startTime = await prompts.unixTime('start')
  const endTime = await prompts.unixTime('end')
  const delegationDetails = {
    amount: amount.amount,
    nodeId: nodeId.id,
    startTime: startTime.time,
    endTime: endTime.time
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

function makeForDefiArguments(txnType: string, baseargv: string[], txnId: string) {
  if (txnType == 'sign') {
    const argsSign = [...baseargv.slice(0, 2), 'forDefi', 'sign', '-i', `${txnId}`]
    return argsSign
  }
  if (txnType == 'fetch') {
    const argsFetch = [...baseargv.slice(0, 2), 'forDefi', 'fetch', '-i', `${txnId}`]
    return argsFetch
  }
  if (txnType == 'send') {
    const argsSign = [...baseargv.slice(0, 2), 'send', '-i', `${txnId}`]
    return argsSign
  }
  return []
}

/**
 * @description - Get the prompts address
 * @returns - prompts address
 */
// async function getPromptsAddress() {
//   return (await prompts.receiverAddress()).address;
// }

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
  const choiceList = await createChoicesFromAddress(pathList)
  const selectedAddress = await prompts.selectAddress(choiceList)
  const selectedDerivedAddress = pathList.find((item) => item.ethAddress == selectedAddress.address)
  const selectedDerivationPath = selectedDerivedAddress?.derivationPath
  return selectedDerivationPath
}
