import chalk from 'chalk'

export function log(msg: string) {
  console.log(msg)
}

export function logInfo(msg: string) {
  console.log(chalk.blue(msg))
}

export function logError(msg: string) {
  console.log(chalk.red(msg))
}

export function logSuccess(msg: string) {
  console.log(chalk.green(msg))
}

export function logWarning(msg: string) {
  console.log(chalk.yellow(msg))
}
