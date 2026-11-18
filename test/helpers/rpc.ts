/** JSON-RPC helpers shared by the characterization and integration tests. */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: unknown;
}

/** Deterministic JSON: object keys sorted recursively, so equal params give equal keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** A JSON-RPC error answer, with the node's own message; the error's message stays "RPC <method> error: <JSON>". */
export class RpcError extends Error {
  override readonly name = "RpcError";
  constructor(
    method: string,
    readonly rpcError: unknown
  ) {
    super(`RPC ${method} error: ${JSON.stringify(rpcError)}`);
  }

  /** The node's message (`error.message` of the answer), or undefined when it has none. */
  get nodeMessage(): string | undefined {
    const { rpcError } = this;
    return typeof rpcError === "object" &&
      rpcError !== null &&
      "message" in rpcError &&
      typeof rpcError.message === "string"
      ? rpcError.message
      : undefined;
  }
}

export async function rpcCall<T = unknown>(
  baseUrl: string,
  path: string,
  method: string,
  params: unknown = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} HTTP ${response.status}`);
  }
  const json = (await response.json()) as JsonRpcResponse;
  if (json.error) {
    throw new RpcError(method, json.error);
  }
  return json.result as T;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
