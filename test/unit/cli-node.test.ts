import { expect } from "chai";
import { nodeOverrides } from "../../src/cli/node";

describe("cli/node", () => {
  it("maps Commander options to node overrides", () => {
    expect(nodeOverrides({ rpcUrl: "https://node.example", apiKey: "k" })).to.deep.equal({
      apiUrl: "https://node.example",
      apiKey: "k",
    });
    expect(nodeOverrides({})).to.deep.equal({ apiUrl: undefined, apiKey: undefined });
  });
});
