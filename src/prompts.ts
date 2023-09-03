import inquirer from 'inquirer';
import { colorCodes } from './constants';
import { taskConstants, networkConstants, walletConstants } from './screenConstants';


/**
 * Provides various prompts used in the CLI for user interaction.
 */
export const prompts = {
    connectWallet: async () => {
        const questions = [
            {
                type: 'list',
                name: 'wallet',
                message: `${colorCodes.magentaColor}How do you want to connect your wallet?${colorCodes.resetColor}`,
                choices: [
                    ...Object.values(walletConstants)
                ],
                filter: (val: string) => {
                    const key = Object.keys(walletConstants).find(key => walletConstants[key] == val)
                    return key
                }
            },
        ];
        return inquirer.prompt(questions);
    },

    pvtKeyPath: async () => {
        const questions = [
            {
                type: 'input',
                name: 'pvtKeyPath',
                message: `${colorCodes.magentaColor}Enter Path to Private Key file ${colorCodes.yellowColor}(E.g. /home/wallet/pvtKeyFile)${colorCodes.resetColor}:`,
            },
        ];
        return inquirer.prompt(questions);
    },

    publicKey: async () => {
        const questions = [
            {
                type: 'input',
                name: 'publicKey',
                message: `${colorCodes.magentaColor}Enter your secp256k1 curve public key ${colorCodes.yellowColor}(E.g. 0x02efe41c5d213089cb7a9e808505e9084bb9eb2bf3aa8050ea92a5ae9e20e5a692)${colorCodes.magentaColor}:${colorCodes.resetColor}`,
            },
        ];
        return inquirer.prompt(questions);
    },

    amount: async () => {
        const questions = [
            {
                type: 'input',
                name: 'amount',
                message: `${colorCodes.magentaColor}Enter amount ${colorCodes.yellowColor}(in FLR)${colorCodes.magentaColor}:${colorCodes.resetColor}`,
            },
        ];
        return inquirer.prompt(questions);
    },

    nodeId: async () => {
        const questions = [
            {
                type: 'input',
                name: 'id',
                message: `${colorCodes.magentaColor}Enter Node NodeId ${colorCodes.yellowColor}(E.g. NodeID-FQKTLuZHEsjCxPeFTFgsojsucmdyNDsz1)${colorCodes.magentaColor}:${colorCodes.resetColor}`,
            },
        ];
        return inquirer.prompt(questions);
    },

    unixTime: async (timeType: string) => {
        const questions = [
            {
                type: 'input',
                name: 'time',
                message: `${colorCodes.magentaColor}Enter ${timeType} time${colorCodes.yellowColor}(E.g. 1693185095)${colorCodes.magentaColor}:${colorCodes.resetColor}`,
            },
        ];
        return inquirer.prompt(questions);
    },

    ctxFile: async () => {
        const questions = [
            {
                type: 'list',
                name: 'isContinue',
                message: `${colorCodes.magentaColor}Do you wish to continue with this?${colorCodes.resetColor}`,
                choices: [
                    "yes",
                    "no"
                ],
                filter: (val: string) => {
                    return val == "yes" ? true : false
                }
            },
        ];
        return inquirer.prompt(questions);
    },

    selectNetwork: async () => {
        const questions = [
            {
                type: 'list',
                name: 'network',
                message: `${colorCodes.magentaColor}Which network do you want to connect to?${colorCodes.resetColor}`,
                choices: [
                    ...Object.values(networkConstants)
                ],
                filter: (val: string) => {
                    const key = Object.keys(networkConstants).find(key => networkConstants[key] == val)
                    return key
                }
            },
        ];
        return inquirer.prompt(questions);
    },

    selectTask: async () => {
        const questions = [
            {
                type: 'list',
                name: 'task',
                message: `${colorCodes.magentaColor}What do you want to do?${colorCodes.resetColor}`,
                choices: [
                    ...Object.keys(taskConstants)
                ],
            },
        ];
        return inquirer.prompt(questions);
    },

    selectAddress: async (choiceList: string[]) => {
        const questions = [
            {
                type: 'list',
                name: 'address',
                message: `${colorCodes.magentaColor}Which address do you want to use?${colorCodes.resetColor}`,
                choices: [
                    ...choiceList
                ],
                filter: (val: string) => {
                    const address = val.split(" ")[1]
                    return address
                }
            },
        ];
        return inquirer.prompt(questions);
    },

    delegationFee: async () => {
        const questions = [
            {
                type: 'input',
                name: 'fee',
                message: `${colorCodes.magentaColor}Enter delegation fee${colorCodes.yellowColor}(E.g. 10)${colorCodes.magentaColor}:${colorCodes.resetColor}`,
            },
        ];
        return inquirer.prompt(questions);
    }
}
