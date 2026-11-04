/**
 * `send -i` against a scripted node: when the signed file is marked as sent
 * (as soon as the node takes the transaction) and when the mark is removed
 * again (only when the chain refuses it). Uses the recorded unsigned files.
 */
import { expect } from "chai";
import fs from "fs";
import { sendSignedTransaction } from "../../src/app/send";
import type { Clients } from "../../src/chain/clients";
import { networkConfig } from "../../src/chain/network";
import { isAlreadySentToChain, signedTxPath, writeSignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import { SubmittedTxError, TxNotAcceptedError } from "../../src/core/submit";
import type { Env } from "../../src/core/types";
import { describeError } from "../../src/output";
import { readGolden } from "../characterization/scenarios";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { signMessageHash } from "../helpers/keys";

interface ScriptedNode {
  /** Statuses returned by successive polls; the last one repeats. */
  statuses: string[];
  /** When set, issuing fails like a node refusing the transaction outright. */
  issueError?: string;
  /** When set, every status poll fails like a node that cannot be reached. */
  pollError?: string;
  /** Runs when the node takes the transaction, before the tool marks the file. */
  onIssue?: () => void;
  /** Whether the file was already marked when the first status poll came in. */
  markedAtFirstPoll?: boolean;
}

function scriptedEnv(node: ScriptedNode, id: string, cwd: string): Env {
  const poll = (): Promise<string> => {
    node.markedAtFirstPoll ??= isAlreadySentToChain(id, cwd);
    if (node.pollError) return Promise.reject(new Error(node.pollError));
    return Promise.resolve(node.statuses.length > 1 ? node.statuses.shift()! : node.statuses[0]!);
  };
  const taken = <T>(value: T): Promise<T> => {
    if (node.issueError) return Promise.reject(new Error(node.issueError));
    node.onIssue?.();
    return Promise.resolve(value);
  };
  const issue = () => taken({ txID: "2TxIdFromTheScriptedNode" });
  const clients = {
    verifyNetwork: () => Promise.resolve(),
    pvm: { issueSignedTx: issue, getTxStatus: async () => ({ status: await poll(), reason: "" }) },
    evm: { issueSignedTx: issue, getAtomicTxStatus: async () => ({ status: await poll() }) },
    provider: {
      send: () => taken("0xEvmHashFromTheScriptedNode"),
      getTransactionReceipt: async () => ((await poll()) === "Committed" ? { status: 1 } : null),
    },
  };
  return { network: networkConfig("localflare", {}), clients: clients as unknown as Clients };
}

function writeSigned(scenario: string, id: string, cwd: string): void {
  const unsigned = readGolden(scenario).outcome.unsignedTxJson as UnsignedTxJson & {
    signatureRequests?: { message: string }[];
    message?: string;
  };
  const message = unsigned.signatureRequests?.[0]?.message ?? unsigned.message!; // atomic or EVM file
  writeSignedTxJson({ ...unsigned, signature: signMessageHash(message) }, id, cwd);
}

/** Runs `action` and returns what it printed on stderr. */
async function stderrOf(action: () => Promise<unknown>): Promise<string> {
  const original = console.error;
  const printed: string[] = [];
  console.error = (message: string) => printed.push(message);
  try {
    await action();
  } finally {
    console.error = original;
  }
  return printed.join("\n");
}

const FAST = { timeoutMs: 50, pollMs: 1 };

describe("app/send: the isSentToChain mark", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir("send-");
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  it("is set as soon as the node takes the transaction, before the wait for it", async () => {
    writeSigned("delegate-file", "t", cwd);
    const node: ScriptedNode = { statuses: ["Processing", "Committed"] };
    const result = await sendSignedTransaction("t", scriptedEnv(node, "t", cwd), undefined, cwd, FAST);
    expect(result).to.deep.equal({ txId: "2TxIdFromTheScriptedNode", chainStatus: "Committed" });
    expect(node.markedAtFirstPoll).to.equal(true);
    expect(isAlreadySentToChain("t", cwd)).to.equal(true);
  });

  it("stays set when the wait times out, so that a rerun cannot submit the transaction twice", async () => {
    writeSigned("delegate-file", "t", cwd);
    const env = scriptedEnv({ statuses: ["Processing"] }, "t", cwd);
    await sendSignedTransaction("t", env, undefined, cwd, FAST).then(
      () => expect.fail("the wait should have timed out"),
      (error: unknown) => expect(String(error)).to.match(/submitted but not committed within 50ms/)
    );
    expect(isAlreadySentToChain("t", cwd)).to.equal(true);
    await sendSignedTransaction("t", env, undefined, cwd, FAST).then(
      () => expect.fail("a rerun must not submit again"),
      (error: unknown) => expect(String(error)).to.include("Tx already sent to chain")
    );
  });

  it("stays set and names the transaction when its status cannot be read, on the P-chain and the C-chain", async () => {
    for (const [scenario, id] of [
      ["delegate-file", "p"],
      ["exportCP-file", "c"],
    ] as const) {
      writeSigned(scenario, id, cwd);
      const issued: string[] = [];
      const env = scriptedEnv({ statuses: ["Processing"], pollError: "fetch failed" }, id, cwd);
      await sendSignedTransaction(id, env, undefined, cwd, { ...FAST, onIssued: (txId) => issued.push(txId) }).then(
        () => expect.fail("the status lookup should fail"),
        (error: unknown) =>
          expect(String(error)).to.include(
            "Transaction 2TxIdFromTheScriptedNode was submitted, but its status could not be read: fetch failed"
          )
      );
      expect(issued, scenario).to.deep.equal(["2TxIdFromTheScriptedNode"]); // reported before the wait
      expect(isAlreadySentToChain(id, cwd), scenario).to.equal(true);
    }
  });

  it("keeps the gateway's answer readable and the submitted transaction named (EVM receipt refused with HTTP 403)", async () => {
    writeSigned("withdrawal-file", "e", cwd);
    const forbidden =
      "server response 403 Forbidden (request={ }, response={ }, error=null, code=SERVER_ERROR, version=6.15.0)";
    const env = scriptedEnv({ statuses: ["Processing"], pollError: forbidden }, "e", cwd);
    await sendSignedTransaction("e", env, undefined, cwd, FAST).then(
      () => expect.fail("the receipt lookup should fail"),
      (error: unknown) =>
        expect(describeError(error)).to.equal(
          "Transaction 0xEvmHashFromTheScriptedNode was submitted, but its status could not be read: " +
            "The node answered HTTP 403 Forbidden; check --rpc-url and the API key (--api-key or FLARE_API_KEY)"
        )
    );
    expect(isAlreadySentToChain("e", cwd)).to.equal(true);
  });

  it("names the submitted transaction, printed first, when the file cannot be marked as sent", async () => {
    writeSigned("delegate-file", "t", cwd);
    const node: ScriptedNode = {
      statuses: ["Committed"],
      onIssue: () => fs.writeFileSync(signedTxPath("t", cwd), "not json"), // e.g. a disk that fails the write
    };
    const issued: string[] = [];
    await sendSignedTransaction("t", scriptedEnv(node, "t", cwd), undefined, cwd, {
      ...FAST,
      onIssued: (txId) => issued.push(txId),
    }).then(
      () => expect.fail("marking the file should fail"),
      (error: unknown) => {
        expect(error).to.be.instanceOf(SubmittedTxError);
        expect(String(error)).to.include(
          "Transaction 2TxIdFromTheScriptedNode was submitted, but signed transaction t could not be marked as sent"
        );
      }
    );
    expect(issued).to.deep.equal(["2TxIdFromTheScriptedNode"]);
    expect(node.markedAtFirstPoll).to.equal(undefined); // no wait after the failure
  });

  it("prints the transaction id on stderr when the caller passes no options", async () => {
    writeSigned("delegate-file", "t", cwd);
    const env = scriptedEnv({ statuses: ["Committed"] }, "t", cwd);
    const printed = await stderrOf(() => sendSignedTransaction("t", env, undefined, cwd));
    expect(printed).to.include("Transaction 2TxIdFromTheScriptedNode submitted, waiting for the chain to accept it");
  });

  it("is removed when the P-chain aborts or drops the transaction, which may then be sent again", async () => {
    for (const status of ["Aborted", "Dropped"]) {
      writeSigned("delegate-file", status, cwd);
      const env = scriptedEnv({ statuses: ["Processing", status] }, status, cwd);
      await sendSignedTransaction(status, env, undefined, cwd, FAST).then(
        () => expect.fail(`${status} should fail`),
        (error: unknown) => {
          expect(error).to.be.instanceOf(TxNotAcceptedError);
          expect(String(error)).to.include(`was ${status.toLowerCase()} by the P-chain`);
        }
      );
      expect(isAlreadySentToChain(status, cwd), status).to.equal(false);
    }
  });

  it("is removed when the C-chain drops an atomic transaction", async () => {
    writeSigned("exportCP-file", "c", cwd);
    const env = scriptedEnv({ statuses: ["Processing", "Dropped"] }, "c", cwd);
    await sendSignedTransaction("c", env, undefined, cwd, FAST).then(
      () => expect.fail("Dropped should fail"),
      (error: unknown) => expect(String(error)).to.include("was dropped by the C-chain")
    );
    expect(isAlreadySentToChain("c", cwd)).to.equal(false);
  });

  it("is never set when the node refuses to take the transaction", async () => {
    writeSigned("delegate-file", "t", cwd);
    const env = scriptedEnv({ statuses: ["Committed"], issueError: "insufficient funds" }, "t", cwd);
    await sendSignedTransaction("t", env, undefined, cwd, FAST).then(
      () => expect.fail("issuing should fail"),
      (error: unknown) => expect(String(error)).to.include("insufficient funds")
    );
    expect(isAlreadySentToChain("t", cwd)).to.equal(false);
  });
});
