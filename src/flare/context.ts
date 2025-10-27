import * as settings from "../settings"
import { Context, info } from '@flarenetwork/flarejs'


// Map from network to context
const networkContext = new Map<string, Context.Context>();

export async function getContext(network: string): Promise<Context.Context> {
    let context = networkContext.get(network);
    if (!context) {
        context = await Context.getContextFromURI(settings.URL[network]);
        networkContext.set(network, context);
    }
    return context;
}

export async function isEtnaActive(network: string): Promise<boolean> {
    const infoapi = new info.InfoApi(settings.URL[network]);
    const { etnaTime } = await infoapi.getUpgradesInfo();
    return new Date() > new Date(etnaTime);
}
