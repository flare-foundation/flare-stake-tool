/**
 * `send -i` against a scripted node: when the signed file is marked as sent
 * (as soon as the node takes the transaction) and when the mark is removed
 * again (only when the chain refuses it). Uses the recorded unsigned files.
 */
import { expect } from "chai";
import fs from "fs";
import { sendSignedTransaction, type SendEnv } from "../../src/app/send";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { isAlreadySentToChain, signedTxPath, writeSignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import { SubmittedTxError, TxNotAcceptedError } from "../../src/core/submit";
import { describeError } from "../../src/output";
import { readGolden } from "../characterization/scenarios";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "../helpers/keys";

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
  /** When set, eth_sendRawTransaction answers without a transaction hash. */
  hashless?: boolean;
}

function scriptedEnv(node: ScriptedNode, id: string, cwd: string): SendEnv {
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
  const clients: SendEnv["clients"] = {
    verifyNetwork: () => Promise.resolve(),
    pvm: { issueSignedTx: issue, getTxStatus: async () => ({ status: await poll(), reason: "" }) },
    evm: { issueSignedTx: issue, getAtomicTxStatus: async () => ({ status: await poll() }) },
    provider: {
      send: () => (node.hashless ? taken(null) : taken("0xEvmHashFromTheScriptedNode")),
      // "Committed": mined and executed; "Reverted": mined, but the call failed; anything else: not mined yet
      getTransactionReceipt: async () => {
        const status = await poll();
        return status === "Committed" ? { status: 1 } : status === "Reverted" ? { status: 0 } : null;
      },
    },
  };
  return { network: networkConfig("localflare", {}), clients };
}

/** Writes the recorded unsigned file of `scenario` as signed, by the ewoq key its ctx.json holds unless `key` is given. */
function writeSigned(scenario: string, id: string, cwd: string, key?: string): void {
  const unsigned = readGolden(scenario).outcome.unsignedTxJson as UnsignedTxJson & {
    signatureRequests?: { message: string }[];
    message?: string;
  };
  const message = unsigned.signatureRequests?.[0]?.message ?? unsigned.message!; // atomic or EVM file
  writeSignedTxJson({ ...unsigned, signature: signMessageHash(message, key) }, id, cwd);
}

/** A valid private key that is not ewoq's. */
const FOREIGN_KEY = "22".repeat(32);

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

  it("stays set when an EVM transaction is mined but reverted, since its nonce is used", async () => {
    writeSigned("withdrawal-file", "e", cwd);
    const env = scriptedEnv({ statuses: ["Processing", "Reverted"] }, "e", cwd);
    await sendSignedTransaction("e", env, undefined, cwd, FAST).then(
      () => expect.fail("a reverted transaction should fail"),
      (error: unknown) =>
        expect(String(error)).to.include("Transaction 0xEvmHashFromTheScriptedNode was mined but reverted")
    );
    expect(isAlreadySentToChain("e", cwd)).to.equal(true);
  });

  it("stays set when an EVM or C-chain atomic transaction is not confirmed in time", async () => {
    for (const [scenario, id, expected] of [
      ["withdrawal-file", "e", "Transaction 0xEvmHashFromTheScriptedNode was submitted but not mined within 50ms"],
      ["exportCP-file", "c", "Transaction 2TxIdFromTheScriptedNode was submitted but not accepted within 50ms"],
    ] as const) {
      writeSigned(scenario, id, cwd);
      const env = scriptedEnv({ statuses: ["Processing"] }, id, cwd);
      await sendSignedTransaction(id, env, undefined, cwd, FAST).then(
        () => expect.fail(`${scenario}: the wait should have timed out`),
        (error: unknown) => expect(String(error)).to.include(expected)
      );
      expect(isAlreadySentToChain(id, cwd), scenario).to.equal(true);
    }
  });

  it("is never set when the node answers an EVM transaction without a hash", async () => {
    writeSigned("withdrawal-file", "e", cwd);
    const env = scriptedEnv({ statuses: ["Committed"], hashless: true }, "e", cwd);
    await sendSignedTransaction("e", env, undefined, cwd, FAST).then(
      () => expect.fail("a missing hash should fail"),
      (error: unknown) => expect(String(error)).to.include("The node did not return a transaction hash")
    );
    expect(isAlreadySentToChain("e", cwd)).to.equal(false);
  });

  it("is never set when the signature of an EVM file recovers no signer, which is refused before sending", async () => {
    const unsigned = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedTxJson;
    writeSignedTxJson({ ...unsigned, signature: "00".repeat(65) }, "e", cwd);
    const issued: string[] = [];
    const env = scriptedEnv({ statuses: ["Committed"], onIssue: () => issued.push("issued") }, "e", cwd);
    // the signature library refuses r = 0 itself, before the tool's own "Cannot recover the signer" check
    await sendSignedTransaction("e", env, undefined, cwd, FAST).then(
      () => expect.fail("an unrecoverable signature should fail"),
      (error: unknown) => expect(error).to.be.instanceOf(Error)
    );
    expect(issued).to.deep.equal([]);
    expect(isAlreadySentToChain("e", cwd)).to.equal(false);
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

describe("app/send: the signature must belong to the expected account", () => {
  const ewoq = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
  // P-chain, C-chain atomic and EVM, with the status that ends each wait; the atomic refusals name the public key,
  // the EVM one the address
  const CASES = [
    ["delegate-file", "Committed", "recovered public key differs"],
    ["exportCP-file", "Accepted", "recovered public key differs"],
    ["withdrawal-file", "Committed", "recovered address differs"],
  ] as const;
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir("send-");
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  it("refuses a signature by another key: nothing reaches the node and the file is not marked", async () => {
    for (const [scenario, final, differs] of CASES) {
      writeSigned(scenario, scenario, cwd, FOREIGN_KEY);
      let issued = false;
      const env = scriptedEnv({ statuses: [final], onIssue: () => (issued = true) }, scenario, cwd);
      await sendSignedTransaction(scenario, env, ewoq, cwd, FAST).then(
        () => expect.fail(`${scenario}: a signature by another key must be refused`),
        (error: unknown) =>
          expect(describeError(error), scenario).to.equal(
            `The signature does not belong to the configured account (${differs})`
          )
      );
      expect(issued, scenario).to.equal(false);
      expect(isAlreadySentToChain(scenario, cwd), scenario).to.equal(false);
    }
  });

  it("sends a signature by the expected account", async () => {
    for (const [scenario, final] of CASES) {
      writeSigned(scenario, scenario, cwd);
      const env = scriptedEnv({ statuses: [final] }, scenario, cwd);
      const { txId } = await sendSignedTransaction(scenario, env, ewoq, cwd, FAST);
      expect(txId, scenario).to.be.oneOf(["2TxIdFromTheScriptedNode", "0xEvmHashFromTheScriptedNode"]);
      expect(isAlreadySentToChain(scenario, cwd), scenario).to.equal(true);
    }
  });
});
