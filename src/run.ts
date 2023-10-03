import { Command } from 'commander'
import chalk from 'chalk'
import clear from 'clear'
import figlet from 'figlet'
import { cli } from './cli'
import { interactiveCli } from './interactive/cli'
import { version } from '../package.json'


clear()
console.log(
  chalk.white(
    figlet.textSync('Flare Stake CLI')
  )
)
console.log(chalk.green(`Version: ${version}`))

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
  interactiveCli(baseArgv).then(() => {
    console.log(`Finished execution`)
  }).catch((error) => {
    console.log(chalk.red("E"), error)
  })
}
else {
  const program = new Command("Flare Stake Tool")
  cli(program).then(() => {
    program.parseAsync(getArgv()).catch(err => {
      if (err instanceof Error) {
        console.log(chalk.red(`Error: ${err.message}`))
      }
    })
  })
}