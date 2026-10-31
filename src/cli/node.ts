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
export const API_KEY_DESCRIPTION = `API key sent as the ${API_KEY_HEADER} header with every request (also ${API_KEY_ENV})`;

/** Node overrides from parsed Commander options. */
export function nodeOverrides(options: { rpcUrl?: string | undefined; apiKey?: string | undefined }): NodeOverrides {
  return { apiUrl: options.rpcUrl, apiKey: options.apiKey };
}

/**
 * Node overrides from a raw argv, for `interactive`, which is dispatched before
 * Commander parses the command line. Accepts `--flag value` and `--flag=value`.
 */
export function nodeOverridesFromArgv(argv: readonly string[]): NodeOverrides {
  const valueOf = (flag: string): string | undefined => {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === flag) return argv[i + 1];
      if (arg?.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
    return undefined;
  };
  return { apiUrl: valueOf(RPC_URL_FLAG), apiKey: valueOf(API_KEY_FLAG) };
}
