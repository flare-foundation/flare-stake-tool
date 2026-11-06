/**
 * The replay server answers by request key, not by content: it returns the
 * recorded id for any submission, and the recorded receipt or status for that
 * id. A fixture rewritten for new transaction bytes therefore has to be kept
 * describing them, which this checks for every recorded submission:
 * - EVM: the recorded hash is keccak256 of the recorded bytes, every receipt
 *   for it names that hash, and no receipt uses more gas than the transaction's
 *   limit;
 * - atomic (every P-chain one, and the C-chain imports and exports): the
 *   recorded id is the id of the recorded bytes, and every status query names
 *   a recorded submission.
 */
import { expect } from "chai";
import { Transaction, keccak256 } from "ethers";
import fs from "fs";
import path from "path";
import { ATOMIC_SUBMISSION_METHODS, atomicTxId } from "./rpc-replay";

interface Entry {
  method: string;
  params: unknown;
  response: { result?: unknown };
}

interface Receipt {
  transactionHash: string;
  gasUsed: string;
}

const FIXTURES = path.join(__dirname, "..", "fixtures", "rpc");
const FIXTURE_FILES = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));
const ATOMIC_STATUS_METHODS = new Set(["platform.getTxStatus", "avax.getAtomicTxStatus"]);

function entriesOf(file: string): Entry[] {
  return (JSON.parse(fs.readFileSync(path.join(FIXTURES, file), "utf8")) as { entries: Entry[] }).entries;
}

describe("characterization fixtures: recorded EVM submissions", () => {
  for (const file of FIXTURE_FILES) {
    const entries = entriesOf(file);
    const submissions = entries.filter((e) => e.method === "eth_sendRawTransaction");
    if (submissions.length === 0) continue;

    it(file, () => {
      for (const submission of submissions) {
        const [raw] = submission.params as [string];
        const hash = keccak256(raw);
        expect(submission.response.result, "recorded hash").to.equal(hash);
        const gasLimit = Transaction.from(raw).gasLimit;
        const receipts = entries
          .filter((e) => e.method === "eth_getTransactionReceipt" && (e.params as string[])[0] === hash)
          .map((e) => e.response.result as Receipt | null)
          .filter((r): r is Receipt => r !== null);
        expect(receipts, "a receipt for the submitted transaction").to.not.be.empty;
        for (const receipt of receipts) {
          expect(receipt.transactionHash).to.equal(hash);
          expect(
            BigInt(receipt.gasUsed) <= gasLimit,
            `gasUsed ${receipt.gasUsed} within gasLimit ${gasLimit}`
          ).to.equal(true);
        }
      }
    });
  }
});

describe("characterization fixtures: recorded atomic submissions", () => {
  for (const file of FIXTURE_FILES) {
    const entries = entriesOf(file);
    const submissions = entries.filter((e) => ATOMIC_SUBMISSION_METHODS.has(e.method));
    if (submissions.length === 0) continue;

    it(file, () => {
      const ids = submissions.map((submission) => {
        const id = atomicTxId((submission.params as { tx: string }).tx);
        expect((submission.response.result as { txID?: string } | undefined)?.txID, "recorded id").to.equal(id);
        return id;
      });
      for (const status of entries.filter((e) => ATOMIC_STATUS_METHODS.has(e.method))) {
        expect(ids, "a status query names a recorded submission").to.include((status.params as { txID: string }).txID);
      }
    });
  }
});
