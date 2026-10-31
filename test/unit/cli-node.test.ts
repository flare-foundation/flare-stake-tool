import { expect } from "chai";
import { nodeOverrides, nodeOverridesFromArgv } from "../../src/cli/node";

describe("cli/node", () => {
  it("maps Commander options to node overrides", () => {
    expect(nodeOverrides({ rpcUrl: "https://node.example", apiKey: "k" })).to.deep.equal({
      apiUrl: "https://node.example",
      apiKey: "k",
    });
    expect(nodeOverrides({})).to.deep.equal({ apiUrl: undefined, apiKey: undefined });
  });

  it("reads --rpc-url and --api-key from a raw argv in both spellings, wherever they appear", () => {
    expect(
      nodeOverridesFromArgv(["node", "run.js", "-i", "--rpc-url", "https://node.example", "--api-key", "k"])
    ).to.deep.equal({ apiUrl: "https://node.example", apiKey: "k" });
    expect(
      nodeOverridesFromArgv([
        "node",
        "run.js",
        "interactive",
        "--api-key=k",
        "--rpc-url=https://node.example/ext/info?x-apikey=q",
      ])
    ).to.deep.equal({ apiUrl: "https://node.example/ext/info?x-apikey=q", apiKey: "k" });
    expect(nodeOverridesFromArgv(["node", "run.js", "interactive"])).to.deep.equal({
      apiUrl: undefined,
      apiKey: undefined,
    });
    expect(nodeOverridesFromArgv(["node", "run.js", "--rpc-url"])).to.deep.equal({
      apiUrl: undefined,
      apiKey: undefined,
    });
  });
});
