import { Command } from 'commander'
import { cli } from './cli'
import { logError } from './output'
import figlet from 'figlet'
import chalk from 'chalk'
import clear from 'clear'
import { interactiveCli } from "./interactive-cli"
import { emojis } from './constants'

clear();
console.log(
    chalk.white(
        figlet.textSync('Flare Stake CLI')
    )
);

const baseArgv = process.argv
const command = baseArgv[2]

function getArgv() {
    if (
        command === 'exportCP' ||
        command === 'importCP' ||
        command === 'exportPC' ||
        command === 'importPC' ||
        command === 'stake' ||
        command === 'delegate'
    ) {
        return [...baseArgv.slice(0, 2), 'transaction', ...baseArgv.slice(2)]
    } else if (
        command === 'addresses' ||
        command === 'network' ||
        command === 'balance' ||
        command === 'validators'
    ) {
        return [...baseArgv.slice(0, 2), 'info', ...baseArgv.slice(2)]
    } else {
        return baseArgv
    }
}

if (command == 'interactive' || command == "-i") {
    interactiveCli(baseArgv).then(() => { console.log(`Finished execution${emojis.happy}${emojis.happy}`) })
}
else {
    const program = new Command("Flare Stake Tool")

    cli(program).then(() => {
        program.parseAsync(getArgv()).catch(err => {
            if (err instanceof Error) {
                logError(`Error: ${err.message}`)
            }
        })
    })
}