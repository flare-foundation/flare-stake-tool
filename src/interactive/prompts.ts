import chalk from 'chalk'
import inquirer from 'inquirer'
import {
  taskConstants,
  networkConstants,
  walletConstants,
  derivationModeConstants
} from '../constants/screen'

/**
 * Provides various prompts used in the CLI for user interaction.
 */
export const prompts = {
  connectWallet: async () => {
    const questions = [
      {
        type: 'list',
        name: 'wallet',
        message: chalk.magenta('How do you want to connect your wallet?'),
        choices: [...Object.values(walletConstants)],
        filter: (val: string) => {
          const key = Object.keys(walletConstants).find((key) => walletConstants[key] == val)
          return key
        }
      }
    ]
    return inquirer.prompt<{ wallet: string }>(questions)
  },
  derivationType: async () => {
    const questions = [
      {
        type: 'list',
        name: 'derivation',
        message: chalk.magenta('Choose derivation path...'),
        choices: [...Object.values(derivationModeConstants)],
        filter: (val: string) => {
          const key = Object.keys(derivationModeConstants).find(
            (key) => derivationModeConstants[key] == val
          )
          return key
        }
      }
    ]
    return inquirer.prompt<{ derivation: string }>(questions)
  },
  pvtKeyPath: async () => {
    const questions = [
      {
        type: 'input',
        name: 'pvtKeyPath',
        message:
          chalk.magenta('Enter Path to Private Key file') +
          ' ' +
          chalk.yellow('(E.g. /home/wallet/pvtKeyFile)') +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ pvtKeyPath: string }>(questions)
  },

  publicKey: async () => {
    const questions = [
      {
        type: 'input',
        name: 'publicKey',
        message:
          chalk.magenta('Enter your secp256k1 curve public key') +
          ' ' +
          chalk.yellow(
            '(E.g. 0x02efe41c5d213089cb7a9e808505e9084bb9eb2bf3aa8050ea92a5ae9e20e5a692)'
          ) +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ publicKey: string }>(questions)
  },

  amount: async (amountPurpose: string = '') => {
    const questions = [
      {
        type: 'input',
        name: 'amount',
        message: chalk.magenta(`Enter amount ${amountPurpose}`) + ' ' + chalk.magenta(`(in FLR):`)
      }
    ]
    return inquirer.prompt<{ amount: string }>(questions)
  },

  // exportCP and importPC fees
  fees: async (defaultFees?: unknown) => {
    const questions = [
      {
        type: 'input',
        default: defaultFees,
        name: 'fees',
        message: chalk.magenta('Enter fees (in FLR):')
      }
    ]
    return inquirer.prompt<{ fees: string }>(questions)
  },

  // base fee for exportCP and importPC txs with private key
  baseFee: async (defaultBaseFee?: unknown) => {
    const questions = [
      {
        type: 'input',
        default: defaultBaseFee,
        name: 'baseFee',
        message: chalk.magenta('Enter base fee (in nanoFLR):')
      }
    ]
    return inquirer.prompt<{ baseFee: string }>(questions)
  },

  nodeId: async () => {
    const questions = [
      {
        type: 'input',
        name: 'id',
        message:
          chalk.magenta('Enter NodeId') +
          ' ' +
          chalk.yellow('(E.g. NodeID-FQKTLuZHEsjCxPeFTFgsojsucmdyNDsz1)') +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ id: string }>(questions)
  },

  unixTime: async (timeType: string) => {
    const questions = [
      {
        type: 'input',
        name: 'time',
        message:
          chalk.magenta(`Enter ${timeType} time`) +
          ' ' +
          chalk.yellow('(E.g. 1693185095)') +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ time: string }>(questions)
  },

  ctxFile: async () => {
    const questions = [
      {
        type: 'list',
        name: 'isContinue',
        message: chalk.magenta('Do you wish to continue with this?'),
        choices: ['yes', 'no'],
        filter: (val: string) => {
          return val == 'yes' ? true : false
        }
      }
    ]
    return inquirer.prompt<{ isContinue: boolean }>(questions)
  },

  selectNetwork: async () => {
    const questions = [
      {
        type: 'list',
        name: 'network',
        message: chalk.magenta('Which network do you want to connect to?'),
        choices: [...Object.values(networkConstants)],
        filter: (val: string) => {
          const key = Object.keys(networkConstants).find((key) => networkConstants[key] == val)
          return key
        }
      }
    ]
    return inquirer.prompt<{ network: string }>(questions)
  },

  selectTask: async () => {
    const questions = [
      {
        type: 'list',
        name: 'task',
        message: chalk.magenta('What do you want to do?'),
        choices: [...Object.values(taskConstants)],
        filter: (val: string) => {
          const key = Object.keys(taskConstants).find((key) => taskConstants[key] == val)
          return key
        }
      }
    ]
    return inquirer.prompt<{ task: string }>(questions)
  },

  selectAddress: async (choiceList: string[]) => {
    const questions = [
      {
        type: 'list',
        name: 'address',
        message: chalk.magenta('Which address do you want to use?'),
        choices: [...choiceList],
        filter: (val: string) => {
          const address = val.split(' ')[1]
          return address
        }
      }
    ]
    return inquirer.prompt<{ address: string }>(questions)
  },

  delegationFee: async () => {
    const questions = [
      {
        type: 'input',
        name: 'fee',
        message:
          chalk.magenta('Enter delegation fee') +
          ' ' +
          chalk.yellow('(E.g. 10)') +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ fee: string }>(questions)
  },

  transactionId: async () => {
    const questions = [
      {
        type: 'input',
        name: 'id',
        message:
          chalk.magenta('Enter Transaction Id') +
          ' ' +
          chalk.yellow('(E.g. abc-txn)') +
          chalk.magenta(':')
      }
    ]
    return inquirer.prompt<{ id: string }>(questions)
  },

  importTrxType: async () => {
    const questions = [
      {
        type: 'list',
        name: 'type',
        message: chalk.magenta(
          'Please select the destination chain to which you want to import your funds?'
        ),
        choices: ['P', 'C']
      }
    ]
    return inquirer.prompt<{ type: string }>(questions)
  },
  popBLSPublicKey: async () => {
    const questions = [
      {
        type: 'input',
        name: 'popBLSPublicKey',
        message: chalk.magenta('Please enter the popBLSPublicKey:')
      }
    ]
    return inquirer.prompt<{ popBLSPublicKey: string }>(questions)
  },
  popBLSSignature: async () => {
    const questions = [
      {
        type: 'input',
        name: 'popBLSSignature',
        message: chalk.magenta('Please enter the popBLSSignature:')
      }
    ]
    return inquirer.prompt<{ popBLSSignature: string }>(questions)
  },
  transferAddress: async () => {
    const questions = [
      {
        type: 'input',
        name: 'transferAddress',
        message:
          chalk.magenta('Enter destination P-chain address:')
      }
    ]
    return inquirer.prompt<{ transferAddress: string }>(questions)
  },
}
