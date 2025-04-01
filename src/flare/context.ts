import * as settings from "../settings"
import { Context } from '@flarenetwork/flarejs'


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
