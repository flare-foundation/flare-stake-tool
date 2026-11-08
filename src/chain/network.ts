/**
 * The single source of truth for network parameters. Everything else (node
 * URLs, hrp, EVM chain id, token symbol) derives from this table.
 */
export type NetworkName = "flare" | "songbird" | "costwo" | "coston" | "localflare";

export interface NetworkConfig {
  readonly name: NetworkName;
  /** Avalanche-style network id (P-chain). */
  readonly networkId: number;
  /** Bech32 human-readable part of P/C-chain addresses. */
  readonly hrp: string;
  /** EVM chain id of the C-chain. */
  readonly chainId: number;
  /** Node base URL, no trailing slash (e.g. https://flare-api.flare.network). */
  readonly apiUrl: string;
  /** C-chain JSON-RPC endpoint. */
  readonly rpcUrl: string;
  /** API key sent as the `x-apikey` header with every request, for nodes that require one. */
  readonly apiKey: string | undefined;
  /** Native token symbol, for display only. */
  readonly symbol: string;
}

/** Node settings given on the command line; they win over the environment variables. */
export interface NodeOverrides {
  /** Node base URL, or a full endpoint URL such as `https://host/ext/info?x-apikey=KEY`. */
  apiUrl?: string | undefined;
  apiKey?: string | undefined;
}

export interface ParsedNodeUrl {
  apiUrl: string;
  /** The `x-apikey` query parameter, when the URL carried one. */
  apiKey: string | undefined;
}

interface Definition {
  networkId: number;
  chainId: number;
  apiUrl: string;
  symbol: string;
}

const DEFINITIONS: Record<NetworkName, Definition> = {
  flare: { networkId: 14, chainId: 14, apiUrl: "https://flare-api.flare.network", symbol: "FLR" },
  songbird: { networkId: 5, chainId: 19, apiUrl: "https://songbird-api.flare.network", symbol: "SGB" },
  costwo: { networkId: 114, chainId: 114, apiUrl: "https://coston2-api.flare.network", symbol: "C2FLR" },
  coston: { networkId: 7, chainId: 16, apiUrl: "https://coston-api.flare.network", symbol: "CFLR" },
  localflare: { networkId: 162, chainId: 162, apiUrl: "http://localhost:9650", symbol: "LFLR" },
};

export const NETWORK_NAMES = Object.keys(DEFINITIONS) as readonly NetworkName[];
export const DEFAULT_NETWORK: NetworkName = "flare";

/** Environment variable that replaces the node base URL of whichever network is selected. */
export const RPC_URL_ENV = "FLARE_RPC_URL";
/** Environment variable holding the API key of a node that requires one. */
export const API_KEY_ENV = "FLARE_API_KEY";
/** Header (and query parameter) through which Flare's API gateways take the key. */
export const API_KEY_HEADER = "x-apikey";

export function isNetworkName(value: unknown): value is NetworkName {
  return typeof value === "string" && Object.hasOwn(DEFINITIONS, value);
}

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Masks the value of an `x-apikey` query parameter, so that a URL can go into an error message. */
export function redactApiKey(text: string): string {
  return text.replace(new RegExp(`([?&]${API_KEY_HEADER}=)[^&#\\s"]*`, "gi"), "$1***");
}

/** Secrets in use (the API key, URL credentials), masked wherever they turn up in a message. */
const secrets = new Set<string>();

/** Masks `value` in every message `redactSecrets` cleans from now on. */
export function rememberSecret(value: string | undefined): void {
  if (value !== undefined && value.length >= 4) secrets.add(value);
}

/**
 * A message cleaned of credentials before it is printed: the `x-apikey` query parameter, the user and password of a
 * URL (`https://user:SECRET@host`), and every remembered secret, wherever a library repeats them.
 */
export function redactSecrets(text: string): string {
  let cleaned = redactApiKey(text).replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]*@/gi, "$1***@");
  for (const secret of secrets) cleaned = cleaned.split(secret).join("***");
  return cleaned;
}

/**
 * A node URL as given, for an error about it: with everything up to its last `@` masked, then without its query and
 * fragment, which may hold a key under any spelling (`x%2Dapikey=`). It is refused before any key is remembered. A
 * password typed without escaping can hold `/`, `?` or `#`, so the credentials are masked on the raw input up to the
 * last `@` (more than needed when an `@` is in the query, never less); cutting the query first would have left
 * `SECRET` in `https://alice:SECRET?tail@host`.
 */
function shownNodeUrlInput(input: string): string {
  const text = input
    .trim()
    .replace(/^([a-z][a-z0-9+.-]*:\/\/)?[^]*@/i, (_match, scheme?: string) => `${scheme ?? ""}***@`);
  const cut = text.search(/[?#]/);
  return redactSecrets(cut < 0 ? text : `${text.slice(0, cut)}?…`);
}

/**
 * Turns a node URL into the base URL the clients are built on. A full endpoint
 * URL as copied from a node's documentation (`https://host/ext/info?x-apikey=KEY`)
 * is accepted: the `/ext/...` API path is dropped and an `x-apikey` query
 * parameter becomes the API key.
 */
export function parseNodeUrl(input: string): ParsedNodeUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(
      `Invalid node URL "${shownNodeUrlInput(input)}"; expected a base URL such as https://coston2-api.flare.network`
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid node URL "${shownNodeUrlInput(input)}"; only http and https are supported`);
  }
  const apiKey = nonEmpty(url.searchParams.get(API_KEY_HEADER) ?? undefined);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/ext(\/.*)?$/, "");
  return { apiUrl: url.href.replace(/\/+$/, ""), apiKey };
}

/**
 * Refuses a node that belongs to a different network than the one selected by
 * name. The hrp and chain ids come from the name while the transaction data
 * comes from the node, so a stray `FLARE_RPC_URL` or `--rpc-url` would
 * otherwise act on the node's network under the selected network's label.
 */
export function assertNodeNetwork(network: NetworkConfig, nodeNetworkId: number): void {
  if (nodeNetworkId === network.networkId) {
    return;
  }
  const actual = NETWORK_NAMES.find((name) => DEFINITIONS[name].networkId === nodeNetworkId);
  throw new Error(
    `The node at ${network.apiUrl} is on network ID ${nodeNetworkId}${actual ? ` (${actual})` : ""}, ` +
      `not ${network.name} (${network.networkId}); check --network, --rpc-url and ${RPC_URL_ENV}`
  );
}

/** Whether `hostname` (as `URL.hostname` gives it) is this machine: `localhost`, 127.0.0.0/8 or `[::1]`. */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * The warning for an API key that would go unencrypted over plain http to another machine, or undefined. The key
 * is masked even where the URL repeats it, and so are the URL's credentials.
 */
export function insecureApiKeyWarning(network: Pick<NetworkConfig, "apiUrl" | "apiKey">): string | undefined {
  if (network.apiKey === undefined) return undefined;
  const url = new URL(network.apiUrl);
  if (url.protocol !== "http:" || isLoopback(url.hostname)) return undefined;
  // the key itself is masked here: it is remembered for redactSecrets only once the clients are built
  const shown = redactSecrets(network.apiUrl).split(network.apiKey).join("***");
  return `the API key goes unencrypted to ${shown} over plain http; use an https URL, or no key for this node`;
}

/** The node `--rpc-url` (else `FLARE_RPC_URL`) selects, parsed, or undefined for the network's own; throws on a bad URL. */
export function overriddenNode(
  overrides: NodeOverrides,
  env: NodeJS.ProcessEnv = process.env
): ParsedNodeUrl | undefined {
  const urlInput = nonEmpty(overrides.apiUrl) ?? nonEmpty(env[RPC_URL_ENV]);
  return urlInput === undefined ? undefined : parseNodeUrl(urlInput);
}

/**
 * Resolves a network by name. The node URL comes from `--rpc-url`, else `FLARE_RPC_URL` (or `env[...]`); the API key
 * from `--api-key`, else the selected URL's own `x-apikey` query parameter, else `FLARE_API_KEY`: a key written into
 * the URL belongs to that node, while the environment's may be left over for another one. `FLARE_API_KEY` goes only to
 * the node of `FLARE_RPC_URL` or the network's own, never to one `--rpc-url` names, which takes `--api-key` or its own
 * `x-apikey`: the environment's key would otherwise go to any host a command line names. The hrp, ids and symbol
 * stay those of the network. That is how staging deployments and private nodes are reached, and how the test harness
 * points the tool at a replay server.
 */
export function networkConfig(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: NodeOverrides = {}
): NetworkConfig {
  if (!isNetworkName(name)) {
    throw new Error(`Unknown network "${name}"; expected one of ${NETWORK_NAMES.join(", ")}`);
  }
  const definition = DEFINITIONS[name];
  const node = overriddenNode(overrides, env);
  const apiUrl = node?.apiUrl ?? definition.apiUrl;
  return {
    name,
    networkId: definition.networkId,
    hrp: name,
    chainId: definition.chainId,
    apiUrl,
    rpcUrl: `${apiUrl}/ext/bc/C/rpc`,
    apiKey:
      nonEmpty(overrides.apiKey) ??
      node?.apiKey ??
      (nonEmpty(overrides.apiUrl) === undefined ? nonEmpty(env[API_KEY_ENV]) : undefined),
    symbol: definition.symbol,
  };
}
