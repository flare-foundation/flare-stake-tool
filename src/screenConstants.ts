import { TaskConstantsInterface, NetworkConstantsInterface } from './interfaces'
import { colorCodes } from './constants';

/**
 * @description Object that constains list of tasks user can perform as its keys and their corresponding CLI commands as values.
 */
export const taskConstants: TaskConstantsInterface = {
    'View chain addresses': 'addresses',
    'Check on-chain balance': "balance",
    'Get network info': "network",
    'Get validator info': "validators",
    'Move assets from C-chain to P-chain': 'exportCP',
    'Move assets from P-chain to C-chain': "exportPC",
    'Add a validator node': "stake",
    'Delegate to a validator node': "delegate"
}

/**
 * @description Constant object which contains the supported networks and their corresponding formatted output names as key-value pairs.
 */
export const networkConstants: NetworkConstantsInterface = {
    "flare": `Flare ${colorCodes.greenColor}(Mainnet)${colorCodes.resetColor}`,
    "costwo": `Coston2 ${colorCodes.yellowColor}(Testnet)${colorCodes.resetColor}`,
    "localflare": `LocalHost ${colorCodes.redColor}(for development only)${colorCodes.resetColor}`
}
