import { expect } from "chai";
import { createClients, nodeOfError, notingNode } from "../../src/chain/clients";
import { networkConfig, rememberSecret } from "../../src/chain/network";
import { SubmittedTxError, TxNotAcceptedError } from "../../src/core/submit";
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

describe("output/describeError: node errors", () => {
  /** Port 1 is refused by fetch at once ("bad port") and by ethers' own HTTP client ("ECONNREFUSED"). */
  const CLOSED = "http://127.0.0.1:1";

  it("every client notes the node on its errors, which keep their type and cause", async () => {
    const clients = createClients(networkConfig("localflare", {}, { apiUrl: CLOSED }));
    const failures = await Promise.all(
      [
        () => clients.info.getNetworkId(),
        () => clients.pvm.getFeeConfig(),
        () => clients.evm.getBaseFee(), // through the EVM API's inner C-chain client
        () => clients.upgrades(),
        () => clients.provider.getBlockNumber(),
        () => clients.verifyNetwork(),
      ].map((call) =>
        call().then(
          () => undefined,
          (error: unknown) => error
        )
      )
    );
    clients.provider.destroy();
    for (const [index, error] of failures.entries()) {
      expect(error, String(index)).to.be.instanceOf(Error);
      expect(nodeOfError(error), String(index)).to.equal(CLOSED);
    }
    expect(failures[0]).to.be.instanceOf(TypeError);
    expect(describeError(failures[0])).to.equal(`fetch failed (bad port; node ${CLOSED})`);
    expect(describeError(failures[4])).to.equal(`connect ECONNREFUSED 127.0.0.1:1 (node ${CLOSED})`);
  });

  it("lists each cause once, an AggregateError's errors too, without following a cycle", async () => {
    const refused = (address: string) => new Error(`connect ECONNREFUSED ${address}`);
    const both = new AggregateError([refused("::1:9650"), refused("127.0.0.1:9650")], "");
    const looped = new Error("fetch failed", { cause: both });
    (both as { cause?: unknown }).cause = looped; // a cycle
    // the same message below twice, and the top message again
    const twice = new AggregateError([refused("::1:9650"), refused("::1:9650")], "");
    const again = new Error("fetch failed", { cause: new Error("fetch failed", { cause: twice }) });
    const api = notingNode(
      {
        looped: () => Promise.reject(looped),
        again: () => Promise.reject(again),
        sync: () => {
          throw again;
        },
      },
      "http://localhost:9650"
    );
    const failure = (call: () => unknown) =>
      Promise.resolve()
        .then(call)
        .then(
          () => undefined,
          (error: unknown) => error
        );
    const loopedError = await failure(() => api.looped());
    expect(loopedError).to.equal(looped); // the same object, only noted
    expect(describeError(loopedError)).to.equal(
      "fetch failed (connect ECONNREFUSED ::1:9650; connect ECONNREFUSED 127.0.0.1:9650; node http://localhost:9650)"
    );
    expect(describeError(await failure(() => api.again()))).to.equal(
      "fetch failed (connect ECONNREFUSED ::1:9650; node http://localhost:9650)"
    );
    expect(nodeOfError(await failure(() => api.sync()))).to.equal("http://localhost:9650");
  });

  it("keeps a submitted transaction's context and the not-accepted error as they are", async () => {
    const api = notingNode(
      { status: () => Promise.reject(new Error("fetch failed", { cause: new Error("bad port") })) },
      CLOSED
    );
    const failed = await api.status().then(
      () => undefined,
      (error: unknown) => error
    );
    const submitted = new SubmittedTxError(
      "2TxId",
      "Transaction 2TxId was submitted, but its status could not be read",
      failed
    );
    expect(describeError(submitted)).to.equal(
      `Transaction 2TxId was submitted, but its status could not be read: fetch failed (bad port; node ${CLOSED})`
    );
    const refused = new TxNotAcceptedError("Transaction 2TxId was dropped by the C-chain");
    expect(describeError(refused)).to.equal("Transaction 2TxId was dropped by the C-chain");
  });

  it("leaves other errors' causes out, as their messages already carry them", () => {
    const ledger = new Error("Ledger signing error: rejected by the user", {
      cause: new Error("rejected by the user"),
    });
    expect(describeError(ledger)).to.equal("Ledger signing error: rejected by the user");
  });

  it("builds clients for a URL whose credentials don't decode, and masks them as written", () => {
    const clients = createClients(networkConfig("localflare", {}, { apiUrl: "https://user:abc%def@node.example" }));
    clients.provider.destroy();
    expect(describeError(new Error("seen abc%def in a message"))).to.equal("seen *** in a message");
  });

  it("masks URL credentials, the x-apikey parameter and remembered secrets anywhere in the message", () => {
    rememberSecret("k3y-0f-th3-n0de");
    const message =
      "Request cannot be constructed from a URL that includes credentials: https://user:SECRET@node.example/ext/info" +
      " (also http://node.example/ext/bc/C/rpc?x-apikey=QUERYKEY and a header k3y-0f-th3-n0de)";
    const described = describeError(new Error(message));
    for (const secret of ["user", "SECRET", "QUERYKEY", "k3y-0f-th3-n0de"]) {
      expect(described, secret).to.not.include(secret);
    }
    expect(described).to.include("https://***@node.example/ext/info");
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
