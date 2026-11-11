/**
 * Node selection shared by the command line and the interactive menu:
 * `--rpc-url` / `--api-key`, or `FLARE_RPC_URL` / `FLARE_API_KEY`, point any
 * network name at a different node, such as a staging deployment behind an
 * API key. The network name keeps deciding the hrp and chain ids.
 */
import { API_KEY_ENV, API_KEY_HEADER, RPC_URL_ENV, type NodeOverrides } from "../chain/network";

export const RPC_URL_FLAG = "--rpc-url";
export const API_KEY_FLAG = "--api-key";

export const RPC_URL_OPTION = `${RPC_URL_FLAG} <url>`;
export const RPC_URL_DESCRIPTION =
  `Node base URL replacing the network's default (also ${RPC_URL_ENV}); ` +
  `a full endpoint URL such as https://host/ext/info?${API_KEY_HEADER}=KEY is accepted`;
export const API_KEY_OPTION = `${API_KEY_FLAG} <key>`;
export const API_KEY_DESCRIPTION =
  `API key sent as the ${API_KEY_HEADER} header with every request (also ${API_KEY_ENV}, ` +
  `which goes only to the node of ${RPC_URL_ENV} or the default node)`;

/** Node overrides from parsed Commander options. */
export function nodeOverrides(options: { rpcUrl?: string | undefined; apiKey?: string | undefined }): NodeOverrides {
  return { apiUrl: options.rpcUrl, apiKey: options.apiKey };
}
