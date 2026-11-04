/**
 * The replay server answers by request key, not by content: it returns the
 * recorded hash for any eth_sendRawTransaction, and the recorded receipt for
 * that hash. A fixture rewritten for new transaction bytes therefore has to be
 * kept describing them, which this checks for every recorded EVM submission:
 * the recorded hash is keccak256 of the recorded bytes, every receipt for it
 * names that hash, and no receipt uses more gas than the transaction's limit.
 */
import { expect } from "chai";
import { Transaction, keccak256 } from "ethers";
import fs from "fs";
import path from "path";

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

describe("characterization fixtures: recorded EVM submissions", () => {
  for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
    const { entries } = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), "utf8")) as { entries: Entry[] };
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
