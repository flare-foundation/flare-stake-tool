import { expect } from "chai";
import http from "http";
import type { AddressInfo } from "net";
import { createClients, nodeOfError, notingNode } from "../../src/chain/clients";
import { networkConfig, rememberSecret } from "../../src/chain/network";
import { SubmittedTxError, TxNotAcceptedError } from "../../src/core/submit";
import { getBalances, getValidators } from "../../src/app/info";
import { accountFromPublicKey } from "../../src/chain/keys";
import { asNFlr, asWei } from "../../src/chain/units";
import type { Env } from "../../src/core/types";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";
import {
  describeError,
  describeEvmValues,
  log,
  logError,
  logInfo,
  logProgress,
  logSuccess,
  logWarning,
  reportOutcome,
} from "../../src/output";
import { cleanupTempDir, makeTempDir, runCliAsync } from "../helpers/cli";

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

  it("sets a client's properties on the client itself, so ethers' private-field setters work", () => {
    const clients = createClients(networkConfig("localflare", {}, { apiUrl: CLOSED }));
    try {
      clients.provider.pollingInterval = 3000;
      clients.provider.disableCcipRead = true;
      expect(clients.provider.pollingInterval).to.equal(3000);
      expect(clients.provider.disableCcipRead).to.equal(true);
    } finally {
      clients.provider.destroy();
    }
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

describe("app/info: the node's network", () => {
  it("is checked before balances or validators are read from the node", async () => {
    const mismatch = "The node at http://node is on network ID 14 (flare), not localflare (162)";
    const env = {
      network: networkConfig("localflare", {}),
      clients: { verifyNetwork: () => Promise.reject(new Error(mismatch)) },
    } as unknown as Env;
    const account = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
    for (const read of [() => getBalances(env, account), () => getValidators(env)]) {
      await read().then(
        () => expect.fail("read from a node on another network"),
        (error: unknown) => expect((error as Error).message).to.equal(mismatch)
      );
    }
  });
});

describe("output/describeError: a URL credential", () => {
  it("is masked as written and percent-decoded, in any message", () => {
    const clients = createClients(networkConfig("localflare", {}, { apiUrl: "https://user:p%40ss@node.example" }));
    try {
      expect(describeError(new Error("refused p@ss and p%40ss"))).to.equal("refused *** and ***");
    } finally {
      clients.provider.destroy();
    }
  });
});

describe("output: what is printed", () => {
  it("is cleaned of remembered secrets on stdout and stderr, results as well as errors", () => {
    rememberSecret("SYNTHETIC-OUTPUT-KEY-5150");
    const printed: string[] = [];
    const [log0, error0] = [console.log, console.error];
    console.log = (line: string) => printed.push(line);
    console.error = (line: string) => printed.push(line);
    try {
      for (const print of [log, logInfo, logError, logSuccess, logProgress, logWarning]) {
        print('{"nodeMessage": "SYNTHETIC-OUTPUT-KEY-5150"}');
      }
    } finally {
      [console.log, console.error] = [log0, error0];
    }
    expect(printed).to.have.length(6);
    for (const line of printed) expect(line).to.include('"***"').and.not.to.include("SYNTHETIC");
  });

  it("does not show an API key that a node repeats in a result (info validators)", async () => {
    const key = "SYNTHETIC-REFLECTED-KEY-0042";
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        const { id, method } = JSON.parse(body) as { id: number; method: string };
        const result =
          method === "info.getNetworkID"
            ? { networkID: "162" }
            : { validators: [{ txID: "tx", nodeID: "NodeID-x", nodeMessage: String(req.headers["x-apikey"]) }] };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const cwd = makeTempDir("output-test-");
    try {
      const result = await runCliAsync(
        ["info", "validators", "--network", "localflare", "--rpc-url", url, "--api-key", key],
        { cwd }
      );
      expect(result.exitCode, result.stderr).to.equal(0);
      expect(result.stdout).to.include('"nodeMessage": "***"');
      expect(result.stdout + result.stderr).not.to.include(key);
    } finally {
      cleanupTempDir(cwd);
      await new Promise<void>((done) => server.close(() => done()));
    }
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

  it("prints a C-chain transaction's nonce, claim amount and executor fees, read from the chain, for co-signers", () => {
    const pending = { status: "pending", id: "c1", forDefiHash: "h", file: "f" } as const;
    expect(describeEvmValues({ ...pending, evm: { nonce: 9, claimed: asWei(4n * 10n ** 18n) } }, "FLR")).to.deep.equal([
      "Nonce: 9",
      "Claim amount: 4 FLR",
    ]);
    expect(
      describeEvmValues({ ...pending, evm: { nonce: 3, executorFees: asWei(2n * 10n ** 17n) } }, "FLR")
    ).to.deep.equal(["Nonce: 3", "Executor fees: 0.2 FLR"]);
    expect(describeEvmValues({ ...pending, fee: asNFlr(1n) }, "FLR"), "an atomic transaction").to.deep.equal([]);
  });
});
