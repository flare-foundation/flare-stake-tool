import AvalancheApp from '@avalabs/hw-app-avalanche'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'

/**
 *
 * @param derivationPath - path to the accounts in ledger
 * @param hrp - network hrp
 * @returns returns the address and public key
 */
export async function ledgerGetAccount(derivationPath: string, hrp: string, transport?: TransportNodeHid): Promise<{
    publicKey: string, address: string
}> {
    if (!transport) {
        transport = await getTransportPath()
    }
    const avalanche = new AvalancheApp(transport)
    const pubkaddr = await avalanche.getAddressAndPubKey(derivationPath, false, hrp)
    if (pubkaddr.errorMessage != 'No errors') {
        throw Error(`Can not get address from ledger: ${pubkaddr.errorMessage}, code ${pubkaddr.returnCode}`)
    }
    return {
        publicKey: pubkaddr.publicKey.toString('hex'),
        address: pubkaddr.address
    }
}

/**
 * @description Opens a transport path to HID and returns an instance of class TransportNodeHid
 * @returns {TransportNodeHid}
 */
export async function getTransportPath() {
    const transport = await TransportNodeHid.open(undefined)
    return transport
}