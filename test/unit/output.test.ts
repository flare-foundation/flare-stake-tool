import { expect } from "chai";
import { describeError, reportOutcome } from "../../src/output";

describe("output/describeError", () => {
  it("passes ordinary errors through", () => {
    expect(describeError(new Error("Unknown node id"))).to.equal("Unknown node id");
    expect(describeError("plain")).to.equal("plain");
  });

  it("explains a gateway refusal reported by ethers", () => {
    const withDetails = describeError(
      new Error("server response 403 Forbidden (request={ ... }, response={ ... }, code=SERVER_ERROR, version=6.17.0)")
    );
    expect(withDetails).to.equal(
      "The node answered HTTP 403 Forbidden; check --rpc-url and the API key (--api-key or FLARE_API_KEY)"
    );
    expect(describeError(new Error("server response 401 Unauthorized"))).to.match(
      /^The node answered HTTP 401 Unauthorized;/
    );
    expect(describeError(new Error("server response 500 Internal Server Error (code=SERVER_ERROR)"))).to.equal(
      "server response 500 Internal Server Error (code=SERVER_ERROR)"
    );
  });

  it("explains an HTML error page reported by flarejs", () => {
    const text = describeError(new SyntaxError(`Unexpected token '<', "<!doctype " ... is not valid JSON`));
    expect(text).to.match(/^The node answered with an error page instead of JSON-RPC \(Unexpected token '<'/);
    expect(text).to.include("--api-key or FLARE_API_KEY");
  });

  it("leaves other JSON parse errors alone", () => {
    const message = `Unexpected token '}', "{}}" is not valid JSON`;
    expect(describeError(new SyntaxError(message))).to.equal(message);
  });
});

describe("output/reportOutcome", () => {
  it("prints the outcome's notices as warnings on stderr, after the result", () => {
    const printed: string[] = [];
    const [log, error] = [console.log, console.error];
    console.log = (line: string) => printed.push(`out: ${line}`);
    console.error = (line: string) => printed.push(`err: ${line}`);
    try {
      reportOutcome(
        { status: "sent", txId: "abc", chainStatus: "Accepted", notices: ["2 UTXO(s) (0.000002 FLR) skipped"] },
        "FLR"
      );
    } finally {
      [console.log, console.error] = [log, error];
    }
    expect(printed).to.have.length(2);
    expect(printed[0]).to.match(/^out: .*Transaction with hash abc built and sent/);
    expect(printed[1]).to.match(/^err: .*Warning: 2 UTXO\(s\) \(0\.000002 FLR\) skipped/);
  });
});
