import inquirer from 'inquirer';
import { colorCodes } from './constants';
import { screenConstants } from './screenConstants';

export const prompts = {
    connectWallet: async () => {
        const questions = [
            {
                type: 'list',
                name: 'wallet',
                message: 'How do you want to connect your wallet?',
                choices: ['Ledger', 'Public Key', `Private Key ${colorCodes.redColor}(not recommended)`],
                filter: function (val: string) {
                    return val.split("(")[0];
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
                message: `Enter Path to Private Key file ${colorCodes.yellowColor}(E.g. /home/wallet/pvtKeyFile)${colorCodes.resetColor}:`,
            },
        ];
        return inquirer.prompt(questions);
    },

    publicKey: async () => {
        const questions = [
            {
                type: 'input',
                name: 'publicKey',
                message: `Enter your secp256k1 curve public key ${colorCodes.yellowColor}(E.g. 0x02efe41c5d213089cb7a9e808505e9084bb9eb2bf3aa8050ea92a5ae9e20e5a692)${colorCodes.resetColor}:`,
            },
        ];
        return inquirer.prompt(questions);
    },

    amount: async () => {
        const questions = [
            {
                type: 'input',
                name: 'amount',
                message: `Enter amount(in FLR) to move:`,
            },
        ];
        return inquirer.prompt(questions);
    },

    ctxFile: async () => {
        const questions = [
            {
                type: 'list',
                name: 'ctxChoice',
                message: `You already have an existing ctx file. Do you wish to continue with it?`,
                choices: [
                    "yes",
                    "no"
                ],
            },
        ];
        return inquirer.prompt(questions);
    },

    selectNetwork: async () => {
        const questions = [
            {
                type: 'list',
                name: 'network',
                message: 'Which network do you want to connect to?',
                choices: [`Flare ${colorCodes.greenColor}(Mainnet)`, `Coston2 ${colorCodes.yellowColor}(Testnet)`],
                filter: function (val: string) {
                    const network = val.split(" ")[0]
                    if (network=="flare"){ return "flare"}
                    else return "costwo"
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
                message: 'What do you want to do?',
                choices: [
                    ...Object.keys(screenConstants)
                ],
            },
        ];
        return inquirer.prompt(questions);
    },
};
