/**
 * One place that knows how to talk to a node: the flarejs APIs, the ethers
 * provider for the C-chain, the cached flarejs Context and the fork gate.
 */
import { Context, avm, evm, info, networkIDs, pvm } from "@flarenetwork/flarejs";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { API_KEY_HEADER, assertNodeNetwork, rememberSecret, type NetworkConfig } from "./network";

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

/** Where an error a client threw came from: a field on the error itself, so its type, fields and cause stay. */
const NODE_OF_ERROR = Symbol("node");

/** How far down the cause chain (and an AggregateError's errors) an error is looked into. */
const MAX_CAUSE_DEPTH = 6;

/** The node URL a client noted on `error` or on an error below it, if any. */
export function nodeOfError(error: unknown, depth = 0, seen = new Set<unknown>()): string | undefined {
  if (typeof error !== "object" || error === null || depth > MAX_CAUSE_DEPTH || seen.has(error)) return undefined;
  seen.add(error);
  const own = (error as { [NODE_OF_ERROR]?: string })[NODE_OF_ERROR];
  if (own !== undefined) return own;
  const below = [
    ...(error instanceof AggregateError ? (error.errors as unknown[]) : []),
    (error as { cause?: unknown }).cause,
  ];
  for (const inner of below) {
    const node = nodeOfError(inner, depth + 1, seen);
    if (node !== undefined) return node;
  }
  return undefined;
}

function noteNode(error: unknown, node: string): unknown {
  if (typeof error === "object" && error !== null && Object.isExtensible(error) && !(NODE_OF_ERROR in error)) {
    Object.defineProperty(error, NODE_OF_ERROR, { value: node });
  }
  return error;
}

/**
 * `api` with every failure of its methods, thrown or rejected, noted with the node it asked. Methods, reads and writes
 * run on the object itself, so flarejs and ethers see no difference; values that are not methods are returned as they
 * are.
 */
export function notingNode<T extends object>(api: T, node: string): T {
  return new Proxy(api, {
    // on the object itself, like the reads: ethers' setters write private fields the proxy doesn't have
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]): unknown => {
        try {
          const result: unknown = Reflect.apply(value, target, args);
          return result instanceof Promise
            ? result.catch((error: unknown) => {
                throw noteNode(error, node);
              })
            : result;
        } catch (error) {
          throw noteNode(error, node);
        }
      };
    },
  });
}

/**
 * Remembers a URL credential for masking, as written and decoded. Decoding is best effort: a `%` that starts no
 * escape is valid in a URL, and masking must not refuse a URL the clients accept.
 */
function rememberCredential(serialized: string): void {
  rememberSecret(serialized);
  try {
    rememberSecret(decodeURIComponent(serialized));
  } catch {
    // not decodable: the serialized form is what an error would show
  }
}

export function createClients(network: NetworkConfig): Clients {
  rememberSecret(network.apiKey);
  const { username, password } = new URL(network.apiUrl);
  for (const credential of [username, password]) rememberCredential(credential);
  // The API key travels as a header, never in the URL, so it stays out of logs and error messages.
  const headers = network.apiKey === undefined ? undefined : { [API_KEY_HEADER]: network.apiKey };
  const keyed = <T extends { setFetchOptions(options: RequestInit | undefined): void }>(api: T): T => {
    if (headers) api.setFetchOptions({ headers });
    return api;
  };
  // every request's failure names the node it went to (describeError prints it, credentials masked)
  const node = network.apiUrl;
  const rawEvmApi = keyed(new evm.EVMApi(network.apiUrl));
  keyed(rawEvmApi.ethAPI); // getBaseFee goes through this inner C-chain RPC client, inside the EVM API's methods
  const pvmApi = notingNode(keyed(new pvm.PVMApi(network.apiUrl)), node);
  const evmApi = notingNode(rawEvmApi, node);
  const infoApi = notingNode(keyed(new info.InfoApi(network.apiUrl)), node);
  const avmApi = notingNode(keyed(new avm.AVMApi(network.apiUrl)), node);
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
    provider: notingNode(new JsonRpcProvider(connection, network.chainId, { staticNetwork: true }), node),
    context,
    verifyNetwork,
    upgrades,
    isHeliconActive: async () => heliconActive(await upgrades()),
  };
}
