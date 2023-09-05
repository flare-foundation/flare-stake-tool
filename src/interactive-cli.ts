import { prompts } from "./prompts"
import { taskConstants, walletConstants } from "./screenConstants"
import { colorCodes } from "./constants"
import { Command } from 'commander'
import { cli, initCtxJsonFromOptions } from './cli'
import { ConnectWalletInterface, ContextFile, DelegationDetailsInterface, DerivedAddress, ScreenConstantsInterface } from './interfaces'
import { getPathsAndAddresses } from './ledger/utils'
import fs from 'fs'

/***
 * @description Handles all operations pertaining to the interactive CLL. Creates a list of arguments and internally calls the comamnder based CLI after taking the relevant inputs from the user.
 * @param baseargv List of base arguments passed to the application to invoke the interactive CLI
 * @returns {void}
 */
export async function interactiveCli(baseargv: string[]) {
    const walletProperties: ConnectWalletInterface = await connectWallet()
    const task = await selectTask()

    const program = new Command("Flare Stake Tool")
    await cli(program)

    // First 4 info functions
    if (Object.keys(taskConstants).slice(0, 4).includes(task.toString())) {

        if (walletProperties.wallet == Object.keys(walletConstants)[0] || walletProperties.wallet == Object.keys(walletConstants)[1]) {
            const argsInfo = [...baseargv.slice(0, 2), "info", taskConstants[task], `--ctx-file=ctx.json`]
            await program.parseAsync(argsInfo)
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[2] && walletProperties.path && walletProperties.network) {
            const argsInfo = [...baseargv.slice(0, 2), "info", taskConstants[task], `--env-path=${walletProperties.path}`, `--network=${walletProperties.network}`, "--get-hacked"]
            await program.parseAsync(argsInfo)
        }
        else {
            console.log("Incorrect arguments passed!")
        }
    }

    // Functions for export and import to move funds between chains
    else if (Object.keys(taskConstants).slice(4, 6).includes(task.toString())) {

        if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists("ctx.json")) {
            const { network: ctxNetwork, derivationPath: ctxDerivationPath } = readInfoFromCtx("ctx.json")
            if (ctxNetwork && ctxDerivationPath) {
                const amount = await prompts.amount()
                const argsExport = [...baseargv.slice(0, 2), "transaction", `export${taskConstants[task].slice(-2)}`, '-a', `${amount.amount}`, "--blind", "true", "--derivation-path", ctxDerivationPath, `--network=${ctxNetwork}`, "--ledger"]
                console.log("Please approve export transaction")
                await program.parseAsync(argsExport)
                const argsImport = [...baseargv.slice(0, 2), "transaction", `import${taskConstants[task].slice(-2)}`, "--blind", "true", "--derivation-path", ctxDerivationPath, `--network=${ctxNetwork}`, "--ledger"]
                console.log("Please approve import transaction")
                await program.parseAsync(argsImport)
            }
            else {
                console.log("Missing params in ctx file")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[1] && fileExists("ctx.json")) {
            const { network: ctxNetwork, vaultId: ctxVaultId, publicKey: ctxPublicKey } = readInfoFromCtx("ctx.json")
            if (ctxNetwork && ctxVaultId && ctxPublicKey) {
                const isContinue = await prompts.forDefiContinue()
                if (!isContinue.isContinue) {
                    const txnType = await prompts.forDefiTxn()
                    const txnId = await prompts.transactionId()
                    if (txnType.txn.includes("Export")) {
                        const amount = await prompts.amount()
                        const argsExport = [...baseargv.slice(0, 2), "transaction", `export${taskConstants[task].slice(-2)}`, '-a', `${amount.amount}`, "-i", `${txnId.id}`]
                        await program.parseAsync(argsExport)
                    }
                    else if (txnType.txn.includes("Import")) {
                        const argsImport = [...baseargv.slice(0, 2), "transaction", `import${taskConstants[task].slice(-2)}`, "-i", `${txnId.id}`]
                        await program.parseAsync(argsImport)
                    }
                    const argsSign = makeForDefiArguments("sign", baseargv, txnId.id)
                    await program.parseAsync(argsSign)
                }
                else {
                    const txnId = await prompts.transactionId()
                    const argsFetch = makeForDefiArguments("fetch", baseargv, txnId.id)
                    await program.parseAsync(argsFetch)
                    const argsSend = makeForDefiArguments("send", baseargv, txnId.id)
                    await program.parseAsync(argsSend)
                }
            }
            else {
                console.log("Missing params in ctx file")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[2] && walletProperties.network && walletProperties.path) {
            const amount = await prompts.amount()
            const argsExport = [...baseargv.slice(0, 2), "transaction", `export${taskConstants[task].slice(-2)}`, '-a', `${amount.amount}`, `--env-path=${walletProperties.path}`, `--network=${walletProperties.network}`, "--get-hacked"]
            console.log("Please approve export transaction")
            await program.parseAsync(argsExport)
            const argsImport = [...baseargv.slice(0, 2), "transaction", `import${taskConstants[task].slice(-2)}`, `--env-path=${walletProperties.path}`, `--network=${walletProperties.network}`, "--get-hacked"]
            console.log("Please approve import transaction")
            await program.parseAsync(argsImport)
        }
        else {
            console.log("Incorrect arguments passed!")
        }
    }

    // Adding a validator
    else if (Object.keys(taskConstants)[6] == task.toString()) {

        if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists("ctx.json")) {
            const { network: ctxNetwork, derivationPath: ctxDerivationPath } = readInfoFromCtx("ctx.json")
            const { amount, nodeId, startTime, endTime, delegationFee } = await getDetailsForDelegation(taskConstants[task])
            if (ctxNetwork && ctxDerivationPath && delegationFee) {
                const argsValidator = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, '--delegation-fee', `${delegationFee}`, "--blind", "true", "--derivation-path", ctxDerivationPath, `--network=${ctxNetwork}`, "--ledger"]
                await program.parseAsync(argsValidator)
            } else {
                console.log("Missing values for certain params")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[1] && fileExists("ctx.json")) {
            const { network: ctxNetwork, vaultId: ctxVaultId, publicKey: ctxPublicKey } = readInfoFromCtx("ctx.json")
            if (ctxNetwork && ctxVaultId && ctxPublicKey) {
                const isContinue = await prompts.forDefiContinue()
                if (!isContinue.isContinue) {
                    const txnId = await prompts.transactionId()
                    const { amount, nodeId, startTime, endTime, delegationFee } = await getDetailsForDelegation(taskConstants[task])
                    const argsValidator = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, `--network=${walletProperties.network}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, '--delegation-fee', `${delegationFee}`, "-i", `${txnId.id}`]
                    await program.parseAsync(argsValidator)

                    const argsSign = makeForDefiArguments("sign", baseargv, txnId.id)
                    await program.parseAsync(argsSign)
                }
                else {
                    const txnId = await prompts.transactionId()
                    const argsFetch = makeForDefiArguments("fetch", baseargv, txnId.id)
                    await program.parseAsync(argsFetch)
                    const argsSend = makeForDefiArguments("send", baseargv, txnId.id)
                    await program.parseAsync(argsSend)
                }
            }
            else {
                console.log("Missing params in ctx file")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[2] && walletProperties.network && walletProperties.path) {
            const { amount, nodeId, startTime, endTime, delegationFee } = await getDetailsForDelegation(taskConstants[task])
            const argsValidator = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, `--network=${walletProperties.network}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, '--delegation-fee', `${delegationFee}`, `--env-path=${walletProperties.path}`, "--get-hacked"]
            await program.parseAsync(argsValidator)
        }
        else {
            console.log("only pvt key and ledger supported for staking right now")
        }
    }

    // Delegating to a Validator
    else if (Object.keys(taskConstants)[7] == task.toString()) {

        if (walletProperties.wallet == Object.keys(walletConstants)[0] && fileExists("ctx.json")) {
            const { network: ctxNetwork, derivationPath: ctxDerivationPath } = readInfoFromCtx("ctx.json")
            if (ctxNetwork && ctxDerivationPath) {
                const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(taskConstants[task])
                const argsDelegate = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, "--blind", "true", "--derivation-path", ctxDerivationPath, `--network=${ctxNetwork}`, "--ledger"]
                await program.parseAsync(argsDelegate)
            } else {
                console.log("Missing params in ctx file")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[1] && fileExists("ctx.json")) {
            const { network: ctxNetwork, vaultId: ctxVaultId, publicKey: ctxPublicKey } = readInfoFromCtx("ctx.json")
            if (ctxNetwork && ctxVaultId && ctxPublicKey) {
                const isContinue = await prompts.forDefiContinue()
                if (!isContinue.isContinue) {
                    const txnId = await prompts.transactionId()
                    const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(taskConstants[task])
                    const argsDelegate = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, `--network=${walletProperties.network}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, "-i", `${txnId.id}`]
                    await program.parseAsync(argsDelegate)

                    const argsSign = makeForDefiArguments("sign", baseargv, txnId.id)
                    await program.parseAsync(argsSign)
                }
                else {
                    const txnId = await prompts.transactionId()
                    const argsFetch = makeForDefiArguments("fetch", baseargv, txnId.id)
                    await program.parseAsync(argsFetch)
                    const argsSend = makeForDefiArguments("send", baseargv, txnId.id)
                    await program.parseAsync(argsSend)
                }
            }
            else {
                console.log("Missing params in ctx file")
            }
        }
        else if (walletProperties.wallet == Object.keys(walletConstants)[2] && walletProperties.network && walletProperties.path) {
            const { amount, nodeId, startTime, endTime } = await getDetailsForDelegation(taskConstants[task])
            const argsDelegate = [...baseargv.slice(0, 2), "transaction", taskConstants[task], '-n', `${nodeId}`, `--network=${walletProperties.network}`, '-a', `${amount}`, '-s', `${startTime}`, '-e', `${endTime}`, `--env-path=${walletProperties.path}`, "--get-hacked"]
            await program.parseAsync(argsDelegate)
        }
        else {
            console.log("only pvt key and ledger supported for delegation right now")
        }
    }
    else {
        console.log("Task not supported")
    }
}

async function connectWallet(): Promise<ConnectWalletInterface> {
    const walletPrompt = await prompts.connectWallet()
    const wallet = walletPrompt.wallet
    if (wallet == Object.keys(walletConstants)[2]) {
        console.log(`${colorCodes.redColor}Warning: You are connecting using your private key which is not recommended`)
        const pvtKeyPath = await prompts.pvtKeyPath()
        const path = pvtKeyPath.pvtKeyPath
        const network = await selectNetwork()
        return { wallet, path, network }
    }
    else if (wallet == Object.keys(walletConstants)[1]) {
        const isCreateCtx = await getCtxStatus()

        if (isCreateCtx) {
            const publicKey = await prompts.publicKey()
            const network = await selectNetwork()
            const vaultId = await prompts.vaultId()
            const optionsObject = {
                network,
                blind: false,
                ctxFile: 'ctx.json',
                publicKey: publicKey.publicKey,
                vaultId: vaultId.id
            }
            await initCtxJsonFromOptions(optionsObject)
        }

        return { wallet }
    }
    else if (wallet == Object.keys(walletConstants)[0]) {
        const isCreateCtx = await getCtxStatus()
        let network
        if (isCreateCtx) {
            network = await selectNetwork()

            console.log("Fetching Addresses...")
            const pathList: DerivedAddress[] = await getPathsAndAddresses(network)
            const choiceList = await createChoicesFromAddress(pathList)
            const selectedAddress = await prompts.selectAddress(choiceList)

            const selectedDerivedAddress = pathList.find(item => item.ethAddress == selectedAddress.address)
            const selectedDerivationPath = selectedDerivedAddress?.derivationPath

            const optionsObject = {
                network,
                blind: false,
                ctxFile: 'ctx.json',
                ledger: true
            }
            await initCtxJsonFromOptions(optionsObject, selectedDerivationPath)
        }

        return { wallet }
    }
    else {
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

function fileExists(filePath: string): Boolean {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch (error) {
        return false;
    }
}

function readInfoFromCtx(filePath: string): ContextFile {

    const ctxContent = fs.readFileSync('ctx.json', 'utf-8')
    const ctxData = JSON.parse(ctxContent)

    const publicKey = ctxData.publicKey
    const network = ctxData.network
    const ethAddress = ctxData.ethAddress || undefined
    const derivationPath = ctxData.derivationPath || undefined
    const vaultId = ctxData.vaultId || undefined

    return { publicKey, network, ethAddress, derivationPath, vaultId }

}

async function createChoicesFromAddress(pathList: DerivedAddress[]) {
    const choiceList: string[] = []

    for (let i = 0; i < 10; i++) {
        const choice = pathList[i].ethAddress
        choiceList.push(`${i + 1}. ${choice}`)
    }

    return choiceList
}

async function getCtxStatus(): Promise<boolean> {
    let isCreateCtx = true
    const isFileExist: Boolean = fileExists("ctx.json");

    if (isFileExist) {
        console.log(`${colorCodes.magentaColor}You already have an existing Ctx file with the following parameters - ${colorCodes.resetColor}`)
        const { network: ctxNetwork, publicKey: ctxPublicKey, ethAddress: ctxEthAddress, vaultId: ctxVaultId } = readInfoFromCtx("ctx.json")
        console.log(`${colorCodes.orangeColor}Public Key:${colorCodes.resetColor} ${ctxPublicKey}`)
        console.log(`${colorCodes.orangeColor}Network:${colorCodes.resetColor} ${ctxNetwork}`)
        if (ctxEthAddress) {
            console.log(`${colorCodes.orangeColor}Eth Address:${colorCodes.resetColor} ${ctxEthAddress}`)
        }
        if (ctxVaultId) {
            console.log(`${colorCodes.orangeColor}Vault Id:${colorCodes.resetColor} ${ctxVaultId}`)
        }
        const getUserChoice = await prompts.ctxFile();
        const isContinue: Boolean = getUserChoice.isContinue

        if (isContinue) {
            isCreateCtx = false
        } else {
            try {
                fs.unlinkSync('ctx.json');
                console.log('File "ctx.json" has been deleted.');
            } catch (error) {
                console.error('An error occurred while deleting the file:', error);
            }
        }
    }

    return isCreateCtx
}

async function getDetailsForDelegation(task: string): Promise<DelegationDetailsInterface> {
    const amount = await prompts.amount()
    const nodeId = await prompts.nodeId()
    const startTime = await prompts.unixTime("start")
    const endTime = await prompts.unixTime("end")
    const delegationDetails = {
        amount: amount.amount,
        nodeId: nodeId.id,
        startTime: startTime.time,
        endTime: endTime.time
    }
    if (task == "stake") {
        const fee = await prompts.delegationFee()
        return {
            ...delegationDetails,
            delegationFee: fee.fee
        }
    }
    return delegationDetails
}

function makeForDefiArguments(txnType: string, baseargv: string[], txnId: string) {
    if (txnType == "sign") {
        const argsSign = [...baseargv.slice(0, 2), "forDefi", "sign", "-i", `${txnId}`]
        return argsSign
    }
    if (txnType == "fetch") {
        const argsFetch = [...baseargv.slice(0, 2), "forDefi", "fetch", "-i", `${txnId}`]
        return argsFetch
    }
    if (txnType == "send") {
        const argsSign = [...baseargv.slice(0, 2), "send", "-i", `${txnId}`]
        return argsSign
    }
    return []
}