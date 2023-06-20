import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import AvalancheApp from '@avalabs/hw-app-avalanche'
import { Context } from '../src/constants'
import { unPrefix0x } from '../src/utils'

export async function rawSignWithLedger(ctx: Context, message: string) {
    const messageBuffer = Buffer.from(unPrefix0x(message), 'hex')
	const transport = await TransportNodeHid.open(undefined)
	const avalanche = new AvalancheApp(transport)
	const accountPath = "m/44'/9000'/0'" // testnet, change later
	const signPaths = ["0/0"]
	const resp = await avalanche.signHash(accountPath, signPaths, messageBuffer)
	return resp.signatures!.get("0/0")!.toString('hex')
}