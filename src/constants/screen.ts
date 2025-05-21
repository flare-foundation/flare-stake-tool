import chalk from 'chalk'
import { ScreenConstantsInterface } from '../interfaces'

/**
 * @description Object that contains list of tasks user can perform as its keys and their corresponding CLI commands as values.
 */
export const taskConstants: ScreenConstantsInterface = {
  'addresses': 'View chain addresses',
  'balance': 'Check on-chain balance',
  'network': 'Get network info',
  'validators': 'Get validator info',
  'CP': 'Move assets from C-chain to P-chain',
  'PC': 'Move assets from P-chain to C-chain',
  'stake': 'Add a validator node',
  'delegate': 'Delegate to a validator node',
  'mirror': 'Get Mirror fund details',
  'import': 'Import Funds (in case export fails for either P chain or C chain)',
  'quit': 'Quit'
}

/**
 * @description Constant object which contains the supported networks and their corresponding formatted output names as key-value pairs.
 */
export const networkConstants: ScreenConstantsInterface = {
  "flare": "Flare " + chalk.green("(mainnet)"),
  "songbird": "Songbird " + chalk.green("(canary)"),
  "costwo": "Coston2 " + chalk.yellow("(testnet)"),
  "coston": "Coston " + chalk.yellow("(testnet)"),
  "localflare": "LocalHost " + chalk.red("(devnet)"),
}

/**
 * @description Constant object which contains the supported wallets and their corresponding formatted output names as key-value pairs.
 */
export const walletConstants: ScreenConstantsInterface = {
  "ledger": 'Ledger',
  "privateKey": "Private Key " + chalk.red("(not recommended!)")
}

/**
 * @description Constant object which contains the supported wallet derivation path modes and their corresponding formatted output names as key-value pairs.
 */
export const derivationModeConstants: ScreenConstantsInterface = {
  "bip44": 'BIP44 (Default)',
  "ledger_live": 'Ledger Live',
}