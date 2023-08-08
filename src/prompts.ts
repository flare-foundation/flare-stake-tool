import inquirer from 'inquirer';
import { colorCodes } from './constants';

const prompts = {
    connectWallet: async () => {
        const questions = [
            {
                type: 'list',
                name: 'wallet',
                message: 'How do you want to connect your wallet?',
                choices: ['Ledger', 'Public Key', `Private Key ${colorCodes.redColor}(not recommended)`],
                filter: function (val : string) {
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
                message: `Enter Path to Private Key file ${colorCodes.yellowColor}(E.g. /home/wallet/pvtKeyFile):`,
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
                filter: function(val : string){
                    return val.split(" ")[0];
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
                    'View chain addresses',
                    'Check on-chain balance',
                    'Get network info',
                    'Get validator info',
                    'Move assets from C-chain to P-chain',
                    'Move assets from P-chain to C-chain',
                    'Add a validator node',
                    'Delegate to a validator node',
                ],
            },
        ];
        return inquirer.prompt(questions);
    },
};

module.exports = prompts;
