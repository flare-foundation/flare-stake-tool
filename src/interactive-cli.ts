import { prompts } from "./prompts"
import { screenConstants } from "./screenConstants"
import { colorCodes } from "./constants"
import { Command } from 'commander'
import { cli } from './cli'
import { ScreenConstantsInterface } from './interfaces'
import fs from 'fs'

export async function interactiveCli(baseargv: string[]) {
    const { wallet, path } = await connectWallet()
    const network = await selectNetwork()
    const task = await selectTask()

    const program = new Command("Flare Stake Tool")
    await cli(program)

    if (Object.keys(screenConstants).slice(0, 4).includes(task.toString())) {
        if (wallet.includes("Private Key")) {
            const args = [...baseargv.slice(0, 2), "info", screenConstants[task], `--env-path=${path}`, `--network=${network}`, "--get-hacked"]
            await program.parseAsync(args)
        } else if (wallet.includes("Public Key")) {
            if (path != "exists") {
                const initArgs = [...baseargv.slice(0, 2), "init-ctx", "-p", path, `--network=${network}`]
                await program.parseAsync(initArgs)
            }
            const args = [...baseargv.slice(0, 2), "info", screenConstants[task], `--ctx-file=ctx.json`]
            // console.log(args)
            await program.parseAsync(args)
        }
    }
    else if (Object.keys(screenConstants).slice(4, 6).includes(task.toString())) {
        if (wallet.includes("Private Key")) {
            const amount = await prompts.amount()
            const argsExport = [...baseargv.slice(0, 2), "transaction", screenConstants[task], '-a', `${amount.amount}`, `--env-path=${path}`, `--network=${network}`, "--get-hacked"]
            await program.parseAsync(argsExport)
            const argsImport = [...baseargv.slice(0, 2), "transaction", `import${screenConstants[task].slice(-2)}`, `--env-path=${path}`, `--network=${network}`, "--get-hacked"]
            await program.parseAsync(argsImport)
            console.log("Transaction successful!")
        }
        else {
            console.log("only pvt key supported right now")
        }
    }
    else {
        console.log("Task not supported")
    }
}

async function connectWallet() {
    const walletPrompt = await prompts.connectWallet()
    const wallet = walletPrompt.wallet.split("\\")[0]
    if (wallet.includes("Private Key")) {
        console.log(`${colorCodes.redColor}Warning: You are connecting using your private key which is not recommended`)
        const path = await prompts.pvtKeyPath()
        return { wallet, path: path.pvtKeyPath }
    }
    else if (wallet.includes("Public Key")) {
        let pKey
        let choice = "no"
        const fileExist: Boolean = fileExists("ctx.json")
        if (fileExist) {
            const getUserChoice = await prompts.ctxFile()
            choice = getUserChoice.ctxChoice
            pKey = "exists"
        }
        if (choice == "no" || fileExist == false) {
            if (fileExist) {
                try {
                    fs.unlinkSync('ctx.json');
                    console.log('File "ctx.json" has been deleted.');
                } catch (error) {
                    console.error('An error occurred while deleting the file:', error);
                }
            }
            const publicKey = await prompts.publicKey()
            pKey = publicKey.publicKey
        }
        return { wallet, path: pKey }
    }
    return { wallet }
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