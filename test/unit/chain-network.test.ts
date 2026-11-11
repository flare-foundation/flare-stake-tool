import { expect } from "chai";
import {
  DEFAULT_NETWORK,
  NETWORK_NAMES,
  assertNodeNetwork,
  insecureApiKeyWarning,
  isNetworkName,
  networkConfig,
  parseNodeUrl,
  redactApiKey,
} from "../../src/chain/network";

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

  describe("redactApiKey", () => {
    it("masks the x-apikey query value, whatever its case or position, and keeps the rest", () => {
      expect(redactApiKey("https://h/ext/info?x-apikey=SECRET")).to.equal("https://h/ext/info?x-apikey=***");
      expect(redactApiKey("https://h/?a=1&X-APIKEY=SECRET&b=2")).to.equal("https://h/?a=1&X-APIKEY=***&b=2");
      expect(redactApiKey("https://h/ext/info")).to.equal("https://h/ext/info");
    });

    it("keeps the key out of parseNodeUrl's errors", () => {
      for (const bad of ["ftp://h/ext/info?x-apikey=SECRET", "not a url?x-apikey=SECRET"]) {
        expect(() => parseNodeUrl(bad), bad)
          .to.throw(/Invalid node URL/)
          .with.property("message")
          .that.does.not.include("SECRET");
      }
    });
  });

  describe("assertNodeNetwork", () => {
    it("accepts the node of the selected network", () => {
      for (const name of NETWORK_NAMES) {
        const config = networkConfig(name, {});
        expect(() => assertNodeNetwork(config, config.networkId), name).to.not.throw();
      }
    });

    it("refuses a node of another network and names it when it is known", () => {
      const flare = networkConfig("flare", {}, { apiUrl: "https://coston2-api.flare.network" });
      expect(() => assertNodeNetwork(flare, 114)).to.throw(
        "The node at https://coston2-api.flare.network is on network ID 114 (costwo), not flare (14); check --network, --rpc-url and FLARE_RPC_URL"
      );
      // songbird's network ID (5) is not its chain ID (19): only the network ID identifies the node
      expect(() => assertNodeNetwork(networkConfig("songbird", {}), 19)).to.throw(/network ID 19, not songbird \(5\)/);
    });
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

    it("leaves the query, fragment and credentials of a refused URL out of the error, whatever spells the key", () => {
      for (const input of [
        "https://host.example:bad/ext/info?x%2Dapikey=SECRET",
        "https://host.example:bad/ext/info?X-APIKEY=SECRET",
        "ftp://user:SECRET@host.example/ext/info#x-apikey=SECRET",
        // a password typed without escaping, with characters that end the userinfo before its "@"
        "https://alice:synthetic/SECRET@node.invalid",
        "https://alice:SECRET?tail@node.invalid",
        "https://alice:SECRET#tail@node.invalid",
        "https://alice:SE@CRET@node.invalid:bad",
        "alice:SECRET@node.invalid",
        // an "@" in the query, which masking up to the last "@" uncovered the rest of
        "https://host.invalid:bad/ext/info?x-apikey=SECRET@SECRET",
      ]) {
        let message = "";
        try {
          parseNodeUrl(input);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message, input).to.match(/^Invalid node URL "/);
        expect(message, input).to.not.include("SECRET");
      }
      expect(() => parseNodeUrl("https://host.example:bad/ext/info?x%2Dapikey=SECRET")).to.throw(
        'Invalid node URL "https://host.example:bad/ext/info?…"; expected a base URL'
      );
      // with an "@" anywhere, where credentials end can't be told: only the scheme is shown
      for (const input of [
        "https://alice:synthetic/SECRET@node.invalid",
        "https://alice:SECRET?tail@node.invalid",
        "https://host.invalid:bad/ext/info?x-apikey=public@SECRET",
      ]) {
        expect(() => parseNodeUrl(input), input).to.throw('Invalid node URL "https://***"; expected a base URL');
      }
      expect(() => parseNodeUrl("ftp://user:SECRET@host.example")).to.throw(
        'Invalid node URL "ftp://***"; only http and https are supported'
      );
    });

    it("rejects what is not an http(s) URL", () => {
      expect(() => parseNodeUrl("coston2-api.flare.network")).to.throw(/Invalid node URL "coston2-api.flare.network"/);
      expect(() => parseNodeUrl("ftp://host.example")).to.throw(/only http and https/);
    });
  });

  it("takes the node URL from the options, then the environment; the key from the options, the URL, the environment's own node", () => {
    const env = { FLARE_RPC_URL: "https://env.example/ext/info?x-apikey=from-url", FLARE_API_KEY: "from-env" };
    expect(networkConfig("costwo", env)).to.include({
      apiUrl: "https://env.example",
      rpcUrl: "https://env.example/ext/bc/C/rpc",
      apiKey: "from-url", // the key written into the URL belongs to that node
      hrp: "costwo",
      networkId: 114,
    });
    expect(
      networkConfig(
        "costwo",
        { FLARE_API_KEY: "from-env" },
        { apiUrl: "https://flag.example/ext/info?x-apikey=flag-url" }
      )
    ).to.include({ apiUrl: "https://flag.example", apiKey: "flag-url" });
    expect(networkConfig("costwo", { FLARE_RPC_URL: env.FLARE_RPC_URL })).to.include({ apiKey: "from-url" });
    expect(networkConfig("costwo", env, { apiUrl: "https://flag.example", apiKey: "from-flag" })).to.include({
      apiUrl: "https://flag.example",
      apiKey: "from-flag",
    });
    // FLARE_API_KEY goes to the node of FLARE_RPC_URL or the network's own, never to one --rpc-url names, even with
    // an unused FLARE_RPC_URL set
    expect(networkConfig("costwo", env, { apiUrl: "https://flag.example" })).to.include({
      apiUrl: "https://flag.example",
      apiKey: undefined,
    });
    expect(networkConfig("costwo", { FLARE_API_KEY: "from-env" }, { apiUrl: "https://flag.example" }).apiKey).to.equal(
      undefined
    );
    expect(networkConfig("costwo", { FLARE_RPC_URL: "https://env.example", FLARE_API_KEY: "from-env" })).to.include({
      apiUrl: "https://env.example",
      apiKey: "from-env",
    });
    expect(networkConfig("costwo", { FLARE_API_KEY: "from-env" })).to.include({
      apiUrl: "https://coston2-api.flare.network",
      apiKey: "from-env",
    });
    expect(networkConfig("costwo", {}, { apiKey: "only-key" })).to.include({
      apiUrl: "https://coston2-api.flare.network",
      apiKey: "only-key",
    });
    expect(networkConfig("costwo", { FLARE_API_KEY: "  " }).apiKey).to.equal(undefined);
    expect(() => networkConfig("costwo", {}, { apiUrl: "not a url" })).to.throw(/Invalid node URL/);
  });

  it("warns, without the key, when an API key would go over plain http to another machine", () => {
    const warning = (apiUrl: string, apiKey: string | undefined = "SECRET-KEY") =>
      insecureApiKeyWarning({ apiUrl, apiKey });
    for (const apiUrl of ["http://node.example", "http://localhost.evil.example:9650", "http://192.168.1.10:9650"]) {
      expect(warning(apiUrl), apiUrl).to.equal(
        `the API key goes unencrypted to ${apiUrl} over plain http; use an https URL, or no key for this node`
      );
    }
    for (const apiUrl of [
      "https://node.example",
      "http://localhost:9650",
      "http://127.0.0.1:9650",
      "http://127.5.0.1",
      "http://[::1]:9650",
    ]) {
      expect(warning(apiUrl), apiUrl).to.equal(undefined);
    }
    expect(insecureApiKeyWarning({ apiUrl: "http://node.example", apiKey: undefined })).to.equal(undefined);
    expect(warning("http://user:pass@node.example")).to.include("http://***@node.example").and.not.include("pass");
    // a key no other test has used, so not yet remembered for masking, repeated in the URL's path
    const key = `KEY-IN-PATH-${Date.now()}`;
    expect(insecureApiKeyWarning({ apiUrl: `http://node.example/${key}`, apiKey: key })).to.equal(
      "the API key goes unencrypted to http://node.example/*** over plain http; use an https URL, or no key for this node"
    );
  });
});
