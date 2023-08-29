import { TaskConstantsInterface, NetworkConstantsInterface } from './interfaces'
import { colorCodes } from './constants';

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

export const networkConstants: NetworkConstantsInterface = {
    "flare": `Flare ${colorCodes.greenColor}(Mainnet)${colorCodes.resetColor}`,
    "costwo": `Coston2 ${colorCodes.yellowColor}(Testnet)${colorCodes.resetColor}`,
    "localflare": `LocalHost ${colorCodes.redColor}(for development only)${colorCodes.resetColor}`
}
