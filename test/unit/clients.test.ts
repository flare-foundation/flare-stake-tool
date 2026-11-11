import { expect } from "chai";
import http from "http";
import type { AddressInfo } from "net";
import { createClients, heliconActive } from "../../src/chain/clients";
import { networkConfig } from "../../src/chain/network";
import { describeError } from "../../src/output";

interface SeenRequest {
  path: string;
  method: string;
  apiKey: string | undefined;
}

interface FakeNode {
  url: string;
  seen: SeenRequest[];
  /** Makes the next request for this method fail, like a node that is briefly unavailable. */
  failNext(method: string): void;
  close(): Promise<void>;
}

interface JsonRpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

const CHAIN_IDS: Record<string, string> = {
  X: "qG35QGqZ11Mvh8CxCmVVi22juDH3d4GXYFyLeX3W3aWLXWnVb",
  P: "11111111111111111111111111111111LpoYY",
  C: "2DMeTG89jJGhDBdf1oPmPGqRtdZF8qq4zxmSH7CzoyXXt2bRtU",
};
const ASSET_ID = "QJx3BomP9MGxCy5RPVXyNUeEqzduvuNbxQVXMuPKDakacdY6K";

function answer(method: string, params: unknown): unknown {
  switch (method) {
    case "info.getNetworkID":
      return { networkID: "114" };
    case "info.getBlockchainID":
      return { blockchainID: CHAIN_IDS[(params as { alias: string }).alias] };
    case "info.upgrades":
      return { heliconTime: "1970-01-01T00:00:00Z" };
    case "avm.getAssetDescription":
      return { assetID: ASSET_ID, name: "Avalanche", symbol: "AVAX", denomination: "9" };
    case "avm.getTxFee":
      return { txFee: "1000000", createAssetTxFee: "1000000" };
    case "platform.getFeeConfig":
      return {
        weights: [1, 1000, 1000, 4],
        maxCapacity: 1000000,
        maxPerSecond: 100000,
        targetPerSecond: 50000,
        minPrice: 250,
        excessConversionConstant: 2164043,
      };
    case "eth_chainId":
      return "0x72";
    case "eth_baseFee":
      return "0x5d21dba00";
    default:
      throw new Error(`unexpected method ${method}`);
  }
}

/**
 * A JSON-RPC node (single and batched requests) that records the x-apikey header of every request. A path in
 * `redirects` is answered with a 307 to the same path on the host it names.
 */
function startFakeNode(redirects: Record<string, () => string> = {}): Promise<FakeNode> {
  const seen: SeenRequest[] = [];
  const failing = new Set<string>();
  const server = http.createServer((req, res) => {
    const redirect = redirects[req.url ?? ""];
    if (redirect) {
      req.resume();
      res.writeHead(307, { location: `${redirect()}${req.url ?? ""}` });
      res.end();
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => {
      const header = req.headers["x-apikey"];
      const apiKey = Array.isArray(header) ? header[0] : header;
      const parsed = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];
      const responses = (Array.isArray(parsed) ? parsed : [parsed]).map((request) => {
        seen.push({ path: req.url ?? "", method: request.method, apiKey });
        if (failing.delete(request.method)) {
          return { jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "temporarily unavailable" } };
        }
        try {
          return { jsonrpc: "2.0", id: request.id, result: answer(request.method, request.params) };
        } catch (error) {
          return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: String(error) } };
        }
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(parsed) ? responses : responses[0]));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        seen,
        failNext: (method) => failing.add(method),
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** A host that answers every request with a 307 to the same path on `target`, and counts the requests. */
function startRedirector(
  target: () => string
): Promise<{ url: string; requests: () => number; close(): Promise<void> }> {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    req.resume();
    res.writeHead(307, { location: `${target()}${req.url ?? ""}` });
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests: () => requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe("chain/clients", () => {
  it("treats a missing heliconTime (go-flare 1.14 nodes) as inactive", () => {
    expect(heliconActive({})).to.equal(false);
    expect(heliconActive({ heliconTime: undefined })).to.equal(false);
  });

  it("treats an unparseable heliconTime as inactive, rather than letting the requests through", () => {
    expect(heliconActive({ heliconTime: "not a date" })).to.equal(false);
    expect(heliconActive({ heliconTime: "" })).to.equal(false);
  });

  it("compares heliconTime with now", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(heliconActive({ heliconTime: "1970-01-01T00:00:00Z" }, now)).to.equal(true);
    expect(heliconActive({ heliconTime: "2026-11-03T12:00:00Z" }, now)).to.equal(true);
    expect(heliconActive({ heliconTime: "2026-11-03T12:00:01Z" }, now)).to.equal(false);
    expect(heliconActive({ heliconTime: "9999-12-01T00:00:00Z" }, now)).to.equal(false);
  });

  it("builds clients bound to the network's URLs without touching the network", () => {
    const clients = createClients(networkConfig("coston", {}));
    expect(clients.network.name).to.equal("coston");
    expect(clients.provider._getConnection().url).to.equal("https://coston-api.flare.network/ext/bc/C/rpc");
    expect(clients.provider._getConnection().headers).to.not.have.property("x-apikey");
  });

  describe("against a node that takes an API key", () => {
    let node: FakeNode;

    beforeEach(async () => {
      node = await startFakeNode();
    });

    afterEach(async () => {
      await node.close();
    });

    it("sends the key as the x-apikey header with every request of every client, Context lookups included", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url, apiKey: "secret-key" }));
      try {
        expect(String((await clients.info.getNetworkId()).networkID)).to.equal("114");
        expect(Object.keys((await clients.pvm.getFeeConfig()).weights)).to.have.length(4);
        expect(await clients.evm.getBaseFee()).to.equal(25_000_000_000n);
        expect(await clients.provider.send("eth_chainId", [])).to.equal("0x72");
        expect(await clients.isHeliconActive()).to.equal(true);
        const context = await clients.context();
        expect(context).to.include({
          networkID: 114,
          hrp: "costwo",
          xBlockchainID: CHAIN_IDS["X"],
          pBlockchainID: CHAIN_IDS["P"],
          cBlockchainID: CHAIN_IDS["C"],
          avaxAssetID: ASSET_ID,
        });
        expect(context.baseTxFee).to.equal(1_000_000n);
        expect(Object.keys(context.platformFeeConfig.weights)).to.have.length(4);

        expect([...new Set(node.seen.map((r) => r.method))]).to.include.members([
          "info.getNetworkID",
          "platform.getFeeConfig",
          "eth_baseFee",
          "eth_chainId",
          "info.upgrades",
          "avm.getAssetDescription",
          "avm.getTxFee",
          "info.getBlockchainID",
        ]);
        expect([...new Set(node.seen.map((r) => r.path))].sort()).to.deep.equal([
          "/ext/bc/C/rpc",
          "/ext/bc/P",
          "/ext/bc/X",
          "/ext/info",
        ]);
        const unkeyed = node.seen.filter((r) => r.apiKey !== "secret-key");
        expect(unkeyed, JSON.stringify(unkeyed)).to.deep.equal([]);
        expect(clients.provider._getConnection().getHeader("x-apikey")).to.equal("secret-key");
      } finally {
        clients.provider.destroy();
      }
    });

    it("fetches the Context and the upgrades once", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url, apiKey: "secret-key" }));
      try {
        await clients.context();
        await clients.isHeliconActive();
        const requests = node.seen.length;
        await clients.context();
        await clients.isHeliconActive();
        expect(node.seen.length).to.equal(requests);
      } finally {
        clients.provider.destroy();
      }
    });

    it("asks again for the Context and the upgrades after a failed lookup", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url }));
      try {
        node.failNext("avm.getAssetDescription");
        node.failNext("info.upgrades");
        await clients.context().then(
          () => expect.fail("the Context lookup should fail"),
          (error: unknown) => expect(String(error)).to.include("temporarily unavailable")
        );
        await clients.isHeliconActive().then(
          () => expect.fail("the upgrades lookup should fail"),
          (error: unknown) => expect(String(error)).to.include("temporarily unavailable")
        );
        expect((await clients.context()).avaxAssetID).to.equal(ASSET_ID);
        expect(await clients.isHeliconActive()).to.equal(true);
      } finally {
        clients.provider.destroy();
      }
    });

    it("shares one pending lookup between concurrent callers, and one retry after it failed", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url }));
      const count = (method: string) => node.seen.filter((r) => r.method === method).length;
      try {
        node.failNext("info.getNetworkID");
        const failed = await Promise.allSettled([clients.verifyNetwork(), clients.context(), clients.context()]);
        expect(failed.map((r) => r.status)).to.deep.equal(["rejected", "rejected", "rejected"]);
        expect(count("info.getNetworkID")).to.equal(1);
        expect(count("avm.getAssetDescription")).to.equal(0);

        await Promise.all([clients.verifyNetwork(), clients.context(), clients.context()]);
        await clients.context();
        expect(count("info.getNetworkID")).to.equal(2);
        expect(count("avm.getAssetDescription")).to.equal(1);
      } finally {
        clients.provider.destroy();
      }
    });

    it("asks the node for its network once, shared by the network check and the Context", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url }));
      try {
        await clients.verifyNetwork();
        await clients.context();
        await clients.verifyNetwork();
        expect(node.seen.filter((r) => r.method === "info.getNetworkID")).to.have.length(1);
      } finally {
        clients.provider.destroy();
      }
    });

    it("refuses a node on another network before building anything (stray FLARE_RPC_URL)", async () => {
      // the fake node is a Coston2 node (network ID 114)
      const clients = createClients(networkConfig("flare", { FLARE_RPC_URL: node.url }));
      try {
        const mismatch = /network ID 114 \(costwo\), not flare \(14\); check --network, --rpc-url and FLARE_RPC_URL/;
        await clients.verifyNetwork().then(
          () => expect.fail("verifyNetwork accepted a Coston2 node for flare"),
          (error: unknown) => expect(String(error)).to.match(mismatch)
        );
        await clients.context().then(
          () => expect.fail("context accepted a Coston2 node for flare"),
          (error: unknown) => expect(String(error)).to.match(mismatch)
        );
        expect(node.seen.map((r) => r.method)).to.not.include("avm.getAssetDescription");
      } finally {
        clients.provider.destroy();
      }
    });

    it("refuses a redirect on every request carrying the key: no further host is asked, over one hop or two", async () => {
      // two hops on other ports (another origin), the node last
      const second = await startRedirector(() => node.url);
      const first = await startRedirector(() => second.url);
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: first.url, apiKey: "secret-key" }));
      try {
        const refusal = (error: unknown) => {
          const text = describeError(error);
          expect(text).to.match(
            /^The node answered with a redirect, which a request carrying the API key does not follow \(the key would go to whatever host it names\); give the URL it redirects to with --rpc-url \(/
          );
          expect(text).to.include(`node ${first.url}`);
          expect(text).not.to.include("secret-key");
          return text;
        };
        const flarejs = await clients.info.getNetworkId().then(
          () => expect.fail("flarejs followed the redirect"),
          (error: unknown) => refusal(error)
        );
        expect(flarejs).to.include("unexpected redirect");
        const ethers = await clients.provider.send("eth_chainId", []).then(
          () => expect.fail("ethers followed the redirect"),
          (error: unknown) => refusal(error)
        );
        expect(ethers).to.include(`unexpected redirect to ${second.url}/ext/bc/C/rpc`);
        // the P-chain client, the EVM API's outer client (atomic transactions) and its inner C-chain client, which has
        // fetch options of its own
        for (const [name, request] of [
          ["pvm", () => clients.pvm.getFeeConfig()],
          ["evm (atomic transactions)", () => clients.evm.getAtomicTxStatus("synthetic-tx")],
          ["evm (inner C-chain client)", () => clients.evm.getBaseFee()],
        ] as const) {
          await request().then(
            () => expect.fail(`${name} followed the redirect`),
            (error: unknown) => refusal(error)
          );
        }
        expect(first.requests()).to.equal(5);
        expect(second.requests(), "the redirect's target").to.equal(0);
        expect(node.seen, "the host behind it").to.deep.equal([]);
      } finally {
        clients.provider.destroy();
        await first.close();
        await second.close();
      }
    });

    it("refuses a redirect of the X-chain lookup the Context is assembled from", async () => {
      const elsewhere = await startRedirector(() => "http://127.0.0.1:1");
      const redirecting = await startFakeNode({ "/ext/bc/X": () => elsewhere.url });
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: redirecting.url, apiKey: "secret-key" }));
      try {
        await clients.context().then(
          () => expect.fail("the Context was fetched through a redirect"),
          (error: unknown) => expect(describeError(error)).to.match(/^The node answered with a redirect/)
        );
        expect(redirecting.seen.map((r) => r.method)).to.include("info.getNetworkID"); // asked before the X-chain
        expect(elsewhere.requests(), "the redirect's target").to.equal(0);
      } finally {
        clients.provider.destroy();
        await redirecting.close();
        await elsewhere.close();
      }
    });

    it("names a refused redirect's target without its credentials, query or fragment", async () => {
      const server = http.createServer((req, res) => {
        req.resume();
        res.writeHead(302, { location: "//bob:DUMMY-PASSWORD@other.invalid/next?x-apikey=DUMMY-KEY#DUMMY-FRAGMENT" });
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: url, apiKey: "secret-key" }));
      try {
        const text = await clients.provider.send("eth_chainId", []).then(
          () => expect.fail("ethers followed the redirect"),
          (error: unknown) => describeError(error)
        );
        expect(text).to.include("unexpected redirect to http://other.invalid/next;");
        expect(text).not.to.match(/DUMMY|secret-key/);
      } finally {
        clients.provider.destroy();
        await new Promise<void>((done) => server.close(() => done()));
      }
    });

    it("follows a redirect when no key is configured, as before", async () => {
      const redirector = await startRedirector(() => node.url);
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: redirector.url }));
      try {
        expect(String((await clients.info.getNetworkId()).networkID)).to.equal("114");
        expect(await clients.provider.send("eth_chainId", [])).to.equal("0x72");
        expect(node.seen.map((r) => r.apiKey)).to.deep.equal([undefined, undefined]);
      } finally {
        clients.provider.destroy();
        await redirector.close();
      }
    });

    it("sends no x-apikey header when no key is configured", async () => {
      const clients = createClients(networkConfig("costwo", {}, { apiUrl: node.url }));
      try {
        await clients.info.getNetworkId();
        await clients.provider.send("eth_chainId", []);
        expect(node.seen.map((r) => r.apiKey)).to.deep.equal([undefined, undefined]);
      } finally {
        clients.provider.destroy();
      }
    });
  });
});
