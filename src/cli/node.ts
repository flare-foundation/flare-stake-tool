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
  return { apiUrl: argvValue(argv, RPC_URL_FLAG), apiKey: argvValue(argv, API_KEY_FLAG) };
}

/**
 * The value of `--flag value` or `--flag=value` in a raw argv. As with
 * Commander, the last occurrence wins and a flag without a value is an error.
 */
export function argvValue(argv: readonly string[], flag: string): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`${flag} needs a value`);
      }
      value = next;
      i++;
    } else if (arg?.startsWith(`${flag}=`)) {
      value = arg.slice(flag.length + 1);
    }
  }
  return value;
}
