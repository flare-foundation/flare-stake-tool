/**
 * One place that knows how to talk to a node: the flarejs APIs, the ethers
 * provider for the C-chain, the cached flarejs Context and the fork gate.
 */
import { Context, avm, evm, info, networkIDs, pvm } from "@flarenetwork/flarejs";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { API_KEY_HEADER, assertNodeNetwork, type NetworkConfig } from "./network";

export type UpgradesInfo = Awaited<ReturnType<info.InfoApi["getUpgradesInfo"]>>;

export interface Clients {
  readonly network: NetworkConfig;
  readonly pvm: pvm.PVMApi;
  readonly evm: evm.EVMApi;
  readonly info: info.InfoApi;
  readonly provider: JsonRpcProvider;
  /** flarejs Context (chain ids, asset id, fee config), fetched once (again after a failure), after `verifyNetwork`. */
  context(): Promise<Context.Context>;
  /** Fails unless the node is on the selected network (see `assertNodeNetwork`); asks the node once. */
  verifyNetwork(): Promise<void>;
  /** `info.upgrades`, fetched once (again after a failure). */
  upgrades(): Promise<UpgradesInfo>;
  isHeliconActive(): Promise<boolean>;
}

/** The flarejs lookups the Context is assembled from. */
export interface ContextApis {
  readonly pvm: Pick<pvm.PVMApi, "getFeeConfig">;
  readonly avm: Pick<avm.AVMApi, "getAssetDescription" | "getTxFee">;
  readonly info: Pick<info.InfoApi, "getBlockchainId" | "getNetworkId">;
}

/**
 * Helicon is active when the node reports a `heliconTime` that has passed. Nodes
 * that predate the upgrade (go-flare 1.14) return no field at all, which means
 * "not active" rather than an error.
 */
export function heliconActive(
  upgrades: { heliconTime?: string | null | undefined },
  nowMs: number = Date.now()
): boolean {
  if (upgrades.heliconTime === undefined || upgrades.heliconTime === null) {
    return false;
  }
  const activation = new Date(upgrades.heliconTime).getTime();
  return !Number.isNaN(activation) && activation <= nowMs;
}

/**
 * The lookups of flarejs's `Context.getContextFromURI`, made through the given
 * clients. flarejs builds its own clients inside `getContextFromURI`, which
 * would bypass the API key, so the tool assembles the Context itself.
 */
export async function fetchContext(apis: ContextApis): Promise<Context.Context> {
  const { assetID: avaxAssetID } = await apis.avm.getAssetDescription("AVAX");
  const { txFee: baseTxFee, createAssetTxFee } = await apis.avm.getTxFee();
  const { blockchainID: xBlockchainID } = await apis.info.getBlockchainId("X");
  const { blockchainID: pBlockchainID } = await apis.info.getBlockchainId("P");
  const { blockchainID: cBlockchainID } = await apis.info.getBlockchainId("C");
  const { networkID } = await apis.info.getNetworkId();
  const platformFeeConfig = await apis.pvm.getFeeConfig();
  const id = Number(networkID);
  return Object.freeze({
    networkID: id,
    hrp: networkIDs.getHRP(id),
    xBlockchainID,
    pBlockchainID,
    cBlockchainID,
    avaxAssetID,
    baseTxFee,
    createAssetTxFee,
    platformFeeConfig,
  });
}

/**
 * A lookup asked once and then answered from its cached promise. A failed lookup
 * is forgotten, so the next call asks again (interactive sessions reuse the
 * clients after an error).
 */
function cachedUntilFailure<T>(lookup: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () =>
    (cached ??= lookup().catch((error: unknown) => {
      cached = undefined;
      throw error;
    }));
}

export function createClients(network: NetworkConfig): Clients {
  // The API key travels as a header, never in the URL, so it stays out of logs and error messages.
  const headers = network.apiKey === undefined ? undefined : { [API_KEY_HEADER]: network.apiKey };
  const keyed = <T extends { setFetchOptions(options: RequestInit | undefined): void }>(api: T): T => {
    if (headers) api.setFetchOptions({ headers });
    return api;
  };
  const pvmApi = keyed(new pvm.PVMApi(network.apiUrl));
  const evmApi = keyed(new evm.EVMApi(network.apiUrl));
  keyed(evmApi.ethAPI); // getBaseFee goes through this inner C-chain RPC client
  const infoApi = keyed(new info.InfoApi(network.apiUrl));
  const avmApi = keyed(new avm.AVMApi(network.apiUrl));
  const connection = new FetchRequest(network.rpcUrl);
  if (network.apiKey !== undefined) connection.setHeader(API_KEY_HEADER, network.apiKey);

  // One getNetworkID lookup serves both the network check and the Context.
  const nodeNetworkId = cachedUntilFailure(() => infoApi.getNetworkId());
  const verifyNetwork = async (): Promise<void> => {
    assertNodeNetwork(network, Number((await nodeNetworkId()).networkID));
  };
  const contextApis: ContextApis = {
    pvm: pvmApi,
    avm: avmApi,
    info: { getBlockchainId: (alias) => infoApi.getBlockchainId(alias), getNetworkId: nodeNetworkId },
  };

  const context = cachedUntilFailure(() => verifyNetwork().then(() => fetchContext(contextApis)));
  const upgrades = cachedUntilFailure(() => infoApi.getUpgradesInfo());
  return {
    network,
    pvm: pvmApi,
    evm: evmApi,
    info: infoApi,
    provider: new JsonRpcProvider(connection, network.chainId, { staticNetwork: true }),
    context,
    verifyNetwork,
    upgrades,
    isHeliconActive: async () => heliconActive(await upgrades()),
  };
}
