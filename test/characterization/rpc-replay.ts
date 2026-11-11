/**
 * Record/replay proxy for the JSON-RPC traffic between the CLI and a Flare node.
 *
 * flarejs uses global fetch, ethers' JsonRpcProvider and web3 use node's http
 * module (and ethers batches requests), so the only seam that catches all three
 * is a real HTTP server. In "record" mode every request is forwarded to the live
 * node and the (request, response) pair is appended to a fixture file; in
 * "replay" mode responses are served from that fixture, in recorded order per
 * request key, so a scenario replays byte-for-byte without a node.
 *
 * Transaction submissions are captured in both modes so a golden test can
 * compare the exact bytes the CLI posted.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { utils } from "@flarenetwork/flarejs";
import { stableStringify, type JsonRpcRequest, type JsonRpcResponse } from "../helpers/rpc";

export type Mode = "replay" | "record";

export interface FixtureEntry {
  path: string;
  method: string;
  params: unknown;
  /** `{ result }` or `{ error }` exactly as the node answered. */
  response: { result?: unknown; error?: unknown };
}

export interface Fixture {
  recordedAt: string;
  upstream?: string;
  entries: FixtureEntry[];
}

export interface Submission {
  path: string;
  method: string;
  params: unknown;
}

/** Synthesized responses, consulted before the fixture (replay) or the upstream (record). */
export interface Stub {
  match: (path: string, method: string, params: unknown) => boolean;
  respond: (params: unknown) => unknown;
}

export const SUBMISSION_METHODS = new Set(["platform.issueTx", "avax.issueTx", "eth_sendRawTransaction"]);
export const ATOMIC_SUBMISSION_METHODS = new Set(["platform.issueTx", "avax.issueTx"]);

/** The id of an atomic transaction as issueTx posts it: the signed bytes in hex, followed by a 4-byte checksum. */
export function atomicTxId(txHex: string): string {
  const signed = utils.hexToBuffer(txHex).slice(0, -4);
  return utils.base58check.encode(createHash("sha256").update(signed).digest());
}

/** Hex strings (addresses, hashes) are case-insensitive: web3 sends checksummed addresses, ethers lowercase. */
function normalizeParams(value: unknown): unknown {
  if (typeof value === "string") return /^0x[0-9a-fA-F]*$/.test(value) ? value.toLowerCase() : value;
  if (Array.isArray(value)) return value.map(normalizeParams);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeParams(v)])
    );
  }
  return value;
}

export function requestKey(reqPath: string, method: string, params: unknown): string {
  // A submission's payload is what the goldens compare; the recorded answer (the tx id)
  // is served whatever bytes are posted, so intentional byte changes stay replayable.
  if (SUBMISSION_METHODS.has(method)) {
    return `${reqPath}|${method}|*`;
  }
  return `${reqPath}|${method}|${stableStringify(normalizeParams(params ?? null))}`;
}

export interface StartOptions {
  mode: Mode;
  fixturePath: string;
  /** Live node base URL, record mode only. */
  upstream?: string;
  stubs?: Stub[];
}

export class RpcReplayServer {
  readonly submissions: Submission[] = [];
  /** Request keys that had no recorded response (replay mode). */
  readonly misses: string[] = [];
  readonly url: string;

  private readonly queues = new Map<string, FixtureEntry[]>();
  private readonly cursors = new Map<string, number>();
  /** Request keys a stub answered; their recordings (made in record mode) count as used. */
  private readonly stubbed = new Set<string>();

  private constructor(
    private readonly server: http.Server,
    port: number,
    readonly mode: Mode,
    private readonly fixturePath: string,
    private readonly fixture: Fixture,
    private readonly upstream: string | undefined,
    private readonly stubs: Stub[]
  ) {
    this.url = `http://127.0.0.1:${port}`;
    for (const entry of fixture.entries) {
      const key = requestKey(entry.path, entry.method, entry.params);
      const queue = this.queues.get(key) ?? [];
      queue.push(entry);
      this.queues.set(key, queue);
    }
  }

  static async start(options: StartOptions): Promise<RpcReplayServer> {
    let fixture: Fixture;
    if (options.mode === "replay") {
      if (!fs.existsSync(options.fixturePath)) {
        throw new Error(`fixture ${options.fixturePath} does not exist; run \`pnpm test:record-fixtures\``);
      }
      fixture = JSON.parse(fs.readFileSync(options.fixturePath, "utf8")) as Fixture;
    } else {
      if (!options.upstream) {
        throw new Error("record mode needs an upstream node URL");
      }
      fixture = { recordedAt: new Date().toISOString(), upstream: options.upstream, entries: [] };
    }
    const server = http.createServer();
    const instance = await new Promise<RpcReplayServer>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("could not determine replay server port"));
          return;
        }
        resolve(
          new RpcReplayServer(
            server,
            address.port,
            options.mode,
            options.fixturePath,
            fixture,
            options.upstream,
            options.stubs ?? []
          )
        );
      });
    });
    server.on("request", (req, res) => {
      void instance.onRequest(req, res);
    });
    return instance;
  }

  get entryCount(): number {
    return this.fixture.entries.length;
  }

  /** Writes the fixture (record mode). */
  save(): void {
    fs.mkdirSync(path.dirname(this.fixturePath), { recursive: true });
    fs.writeFileSync(this.fixturePath, JSON.stringify(this.fixture, null, 2) + "\n");
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.closeAllConnections();
      this.server.close(() => resolve());
    });
  }

  private async onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const reqPath = (req.url ?? "/").split("?")[0]!;
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
      return;
    }
    const isBatch = Array.isArray(body);
    const requests = (isBatch ? body : [body]) as JsonRpcRequest[];
    const responses: JsonRpcResponse[] = [];
    for (const request of requests) {
      responses.push(await this.handle(reqPath, request));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(isBatch ? responses : responses[0]));
  }

  private async handle(reqPath: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params } = request;
    if (SUBMISSION_METHODS.has(method)) {
      this.submissions.push({ path: reqPath, method, params });
    }
    const stub = this.stubs.find((s) => s.match(reqPath, method, params));
    let response: FixtureEntry["response"];
    if (stub) {
      response = { result: stub.respond(params) };
      this.stubbed.add(requestKey(reqPath, method, params));
      if (this.mode === "record") {
        this.fixture.entries.push({ path: reqPath, method, params, response });
      }
    } else if (this.mode === "record") {
      response = await this.forward(reqPath, request);
      this.fixture.entries.push({ path: reqPath, method, params, response });
    } else {
      response = this.lookup(reqPath, method, params);
    }
    return { jsonrpc: "2.0", id: request.id ?? null, ...response };
  }

  /**
   * Recorded request keys that were never requested (replay mode). A key requested fewer times than recorded, such
   * as a status poll, is not listed: polls depend on timing. So is `eth_blockNumber`, which ethers polls only while
   * a receipt is not there yet. A key a stub answered counts as requested.
   */
  unused(): string[] {
    return [...this.queues.keys()].filter(
      (key) => !this.cursors.has(key) && !this.stubbed.has(key) && !key.includes("|eth_blockNumber|")
    );
  }

  private lookup(reqPath: string, method: string, params: unknown): FixtureEntry["response"] {
    const key = requestKey(reqPath, method, params);
    const queue = this.queues.get(key);
    if (!queue || queue.length === 0) {
      this.misses.push(key);
      return { error: { code: -32000, message: `replay miss: no recorded response for ${key}` } };
    }
    const cursor = this.cursors.get(key) ?? 0;
    const entry = queue[Math.min(cursor, queue.length - 1)]!;
    this.cursors.set(key, cursor + 1);
    return entry.response;
  }

  private async forward(reqPath: string, request: JsonRpcRequest): Promise<FixtureEntry["response"]> {
    const upstreamResponse = await fetch(`${this.upstream}${reqPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const text = await upstreamResponse.text();
    let json: JsonRpcResponse;
    try {
      json = JSON.parse(text) as JsonRpcResponse;
    } catch {
      return { error: { code: -32000, message: `upstream HTTP ${upstreamResponse.status}: ${text.slice(0, 200)}` } };
    }
    return json.error !== undefined ? { error: json.error } : { result: json.result };
  }
}
