import { Command } from 'commander'
import { cli } from './cli'
import { logError } from './output'
import figlet from 'figlet'
import chalk from 'chalk'
import clear from 'clear'

clear();
console.log(
    chalk.red(
        figlet.textSync('Flare Stake Tool')
    )
);

function getArgv() {
    const baseArgv = process.argv
    const command = baseArgv[2]
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
        console.log([...baseArgv.slice(0, 2), 'info', ...baseArgv.slice(2)])
        return [...baseArgv.slice(0, 2), 'info', ...baseArgv.slice(2)]
    } else if (
        command === 'interactive'
    ) {
        return [...baseArgv.slice(0, 2), 'interactive']
    } else {
        return baseArgv
    }
}

const program = new Command("Flare Stake Tool")

cli(program).then(() => {
    program.parseAsync(getArgv()).catch(err => {
        if (err instanceof Error) {
            logError(`Error: ${err.message}`)
        }
    })
})