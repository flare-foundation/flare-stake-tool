import { prompts } from "./prompts"
import { screenConstants } from "./screenConstants"
import { colorCodes } from "./constants"
import { Command } from 'commander'
import { cli } from './cli'
import { ScreenConstantsInterface } from './interfaces'

export async function interactiveCli(baseargv: string[] ) {
    const { wallet, path } = await connectWallet()
    const network = await selectNetwork()
    const task = await selectTask()

    const program = new Command("Flare Stake Tool")
    await cli(program)

    if (Object.keys(screenConstants).slice(0,4).includes(task.toString())){
        let args = [...baseargv.slice(0,2), "info", screenConstants[task]]
        if (wallet.includes("Private Key")) {
            args = [...args,`--env-path=${path}`,`--network=${network}`,"--get-hacked"]
            await program.parseAsync(args)
        } else if (wallet.includes("Public Key")){
            console.log("public key")
        }
    }
    else{
        console.log("not supported rn")
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
    return { wallet }
}

async function selectNetwork() {
    const network = await prompts.selectNetwork()
    return network.network
}

async function selectTask(): Promise<keyof ScreenConstantsInterface>{
    const task = await prompts.selectTask()
    return task.task
}