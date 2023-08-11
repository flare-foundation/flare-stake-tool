// export const screenConstants = {
//     VIEW_CHAIN_ADDRESS: 'View chain addresses',
//     CHECK_BALANCE: 'Check on-chain balance',
//     NETWORK_INFO: 'Get network info',
//     VALIDATOR_INFO: 'Get validator info',
//     MOVE_C_TO_P: 'Move assets from C-chain to P-chain',
//     MOVE_P_TO_C: 'Move assets from P-chain to C-chain',
//     ADD_VALIDATOR: 'Add a validator node',
//     DELEGATE: 'Delegate to a validator node'
// }

import { ScreenConstantsInterface } from './interfaces'

export const screenConstants : ScreenConstantsInterface = {
    'View chain addresses':'addresses',
    'Check on-chain balance':"balance",
    'Get network info':"network",
    'Get validator info':"validators",
    'Move assets from C-chain to P-chain':'exportCP',
    'Move assets from P-chain to C-chain':"exportPC",
    'Add a validator node':"stake",
    'Delegate to a validator node':"delegate"
}