import { expect } from "chai";
import { DEFAULT_NETWORK, NETWORK_NAMES, isNetworkName, networkConfig, parseNodeUrl } from "../../src/chain/network";

describe("chain/network", () => {
  it("knows the five Flare networks with hrp equal to the name", () => {
    expect([...NETWORK_NAMES]).to.deep.equal(["flare", "songbird", "costwo", "coston", "localflare"]);
    for (const name of NETWORK_NAMES) {
      const config = networkConfig(name, {});
      expect(config.name).to.equal(name);
      expect(config.hrp).to.equal(name);
      expect(config.rpcUrl).to.equal(`${config.apiUrl}/ext/bc/C/rpc`);
      expect(config.apiKey).to.equal(undefined);
    }
    expect(DEFAULT_NETWORK).to.equal("flare");
  });

  it("has the documented ids, including the chain ids that differ from the network ids", () => {
    expect(networkConfig("flare", {})).to.include({ networkId: 14, chainId: 14, symbol: "FLR" });
    expect(networkConfig("songbird", {})).to.include({ networkId: 5, chainId: 19, symbol: "SGB" });
    expect(networkConfig("costwo", {})).to.include({ networkId: 114, chainId: 114, symbol: "C2FLR" });
    expect(networkConfig("coston", {})).to.include({ networkId: 7, chainId: 16, symbol: "CFLR" });
    expect(networkConfig("localflare", {})).to.include({
      networkId: 162,
      chainId: 162,
      apiUrl: "http://localhost:9650",
    });
    const ids = NETWORK_NAMES.map((n) => networkConfig(n, {}).networkId);
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it("uses https for the public networks", () => {
    for (const name of ["flare", "songbird", "costwo", "coston"]) {
      expect(networkConfig(name, {}).apiUrl).to.match(/^https:\/\//);
    }
  });

  it("rejects unknown names and validates with isNetworkName", () => {
    expect(() => networkConfig("local", {})).to.throw(/Unknown network "local"/);
    expect(isNetworkName("flare")).to.equal(true);
    expect(isNetworkName("mainnet")).to.equal(false);
    expect(isNetworkName(undefined)).to.equal(false);
  });

  it("FLARE_RPC_URL replaces only the node URL", () => {
    const config = networkConfig("flare", { FLARE_RPC_URL: "http://10.0.0.5:9650/" });
    expect(config.apiUrl).to.equal("http://10.0.0.5:9650");
    expect(config.rpcUrl).to.equal("http://10.0.0.5:9650/ext/bc/C/rpc");
    expect(config).to.include({ name: "flare", hrp: "flare", networkId: 14, chainId: 14 });
    expect(networkConfig("flare", { FLARE_RPC_URL: "  " }).apiUrl).to.equal("https://flare-api.flare.network");
  });

  describe("parseNodeUrl", () => {
    it("accepts a base URL, with or without a trailing slash", () => {
      expect(parseNodeUrl("http://localhost:9650/")).to.deep.equal({
        apiUrl: "http://localhost:9650",
        apiKey: undefined,
      });
      expect(parseNodeUrl(" https://coston2-api.flare.network ")).to.deep.equal({
        apiUrl: "https://coston2-api.flare.network",
        apiKey: undefined,
      });
      expect(parseNodeUrl("https://host.example/extra/")).to.deep.equal({
        apiUrl: "https://host.example/extra",
        apiKey: undefined,
      });
    });

    it("turns a copied endpoint URL into the base URL and takes the key from the query string", () => {
      expect(parseNodeUrl("https://coston2-api.example/ext/info?x-apikey=abc-123")).to.deep.equal({
        apiUrl: "https://coston2-api.example",
        apiKey: "abc-123",
      });
      expect(parseNodeUrl("https://proxy.example/coston2/ext/bc/C/rpc")).to.deep.equal({
        apiUrl: "https://proxy.example/coston2",
        apiKey: undefined,
      });
      expect(parseNodeUrl("https://host.example/ext")).to.deep.equal({
        apiUrl: "https://host.example",
        apiKey: undefined,
      });
      expect(parseNodeUrl("https://host.example/?x-apikey=#frag")).to.deep.equal({
        apiUrl: "https://host.example",
        apiKey: undefined,
      });
    });

    it("rejects what is not an http(s) URL", () => {
      expect(() => parseNodeUrl("coston2-api.flare.network")).to.throw(/Invalid node URL "coston2-api.flare.network"/);
      expect(() => parseNodeUrl("ftp://host.example")).to.throw(/only http and https/);
    });
  });

  it("takes the node URL and API key from the options, then the environment, then the URL itself", () => {
    const env = { FLARE_RPC_URL: "https://env.example/ext/info?x-apikey=from-url", FLARE_API_KEY: "from-env" };
    expect(networkConfig("costwo", env)).to.include({
      apiUrl: "https://env.example",
      rpcUrl: "https://env.example/ext/bc/C/rpc",
      apiKey: "from-env",
      hrp: "costwo",
      networkId: 114,
    });
    expect(networkConfig("costwo", { FLARE_RPC_URL: env.FLARE_RPC_URL })).to.include({ apiKey: "from-url" });
    expect(networkConfig("costwo", env, { apiUrl: "https://flag.example", apiKey: "from-flag" })).to.include({
      apiUrl: "https://flag.example",
      apiKey: "from-flag",
    });
    expect(networkConfig("costwo", env, { apiUrl: "https://flag.example" })).to.include({
      apiUrl: "https://flag.example",
      apiKey: "from-env",
    });
    expect(networkConfig("costwo", {}, { apiKey: "only-key" })).to.include({
      apiUrl: "https://coston2-api.flare.network",
      apiKey: "only-key",
    });
    expect(networkConfig("costwo", { FLARE_API_KEY: "  " }).apiKey).to.equal(undefined);
    expect(() => networkConfig("costwo", {}, { apiUrl: "not a url" })).to.throw(/Invalid node URL/);
  });
});
