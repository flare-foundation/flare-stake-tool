import chalk from 'chalk'
import { ScreenConstantsInterface } from '../interfaces'


/**
 * @description Object that constains list of tasks user can perform as its keys and their corresponding CLI commands as values.
 */
export const taskConstants: ScreenConstantsInterface = {
  'View chain addresses': 'addresses',
  'Check on-chain balance': "balance",
  'Get network info': "network",
  'Get validator info': "validators",
  'Move assets from C-chain to P-chain': 'CP',
  'Move assets from P-chain to C-chain': "PC",
  'Add a validator node': "stake",
  'Delegate to a validator node': "delegate",
  'Get Mirror fund details': 'mirror',
  'Claim Rewards': "rewards",
  'Withdraw funds': "withdrawal"
}

/**
 * @description Constant object which contains the supported networks and their corresponding formatted output names as key-value pairs.
 */
export const networkConstants: ScreenConstantsInterface = {
  "flare": "Flare " + chalk.green("(mainnet)"),
  "costwo": "Coston2 " + chalk.yellow("(testnet)"),
  "localflare": "LocalHost " + chalk.red("(devnet)")
}

/**
 * @description Constant object which contains the supported wallets and their corresponding formatted output names as key-value pairs.
 */
export const walletConstants: ScreenConstantsInterface = {
  "ledger": 'Ledger',
  "publicKey": 'Public Key',
  "privateKey": "Private Key " + chalk.red("(not recommended!)")
}

/**
 * @description Constant object which contains the supported wallet derivation path modes and their corresponding formatted output names as key-value pairs.
 */
export const derivationModeConstants: ScreenConstantsInterface = {
  "bip44": 'BIP44 (Default)',
  "ledger_live": 'Ledger Live',
}