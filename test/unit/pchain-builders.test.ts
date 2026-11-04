/**
 * P-chain builder details that need chain data: exporting the whole balance
 * (exportPC without -a) and following getUTXOs pagination. Offline, against the
 * recorded exportPC-pk session and a scripted paginated node.
 */
import { utils as futils, type Utxo } from "@flarenetwork/flarejs";
import { expect } from "chai";
import { getBytes } from "ethers";
import { accountFromPrivateKey } from "../../src/chain/keys";
import { buildTransaction } from "../../src/core/builders";
import { UTXO_PAGE_SIZE, allUtxos, maxExportPCAmount, spendableAmount } from "../../src/core/builders/pchain";
import { atomicTxFee } from "../../src/core/fee";
import { FILE_SIGNER_POLICY, IMMEDIATE_SIGNER_POLICY } from "../../src/core/types";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { startReplay, type Replay, type ReplayEnv } from "../helpers/replay";

const account = accountFromPrivateKey(getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`), "localflare");
const now = () => BigInt(Math.floor(Date.now() / 1000));

describe("core/builders/pchain", function () {
  this.timeout(20_000);

  describe("exportPC without -a", () => {
    let replay: Replay;
    let env: ReplayEnv;

    beforeEach(async () => {
      replay = await startReplay("exportPC-pk");
      env = replay.env;
    });

    afterEach(() => replay.close());

    it("exports everything spendable minus the exact fee, leaving nothing behind (chain price and file price)", async () => {
      const context = await env.clients.context();
      const { utxos } = await env.clients.pvm.getUTXOs({ addresses: [account.pAddress] });
      const total = spendableAmount(utxos, context.avaxAssetID, now());
      expect(total > 0n).to.equal(true);
      for (const policy of [IMMEDIATE_SIGNER_POLICY, FILE_SIGNER_POLICY]) {
        const bundle = await buildTransaction({ type: "exportPC" }, env, account, policy);
        if (bundle.kind !== "atomic") throw new Error("exportPC must be atomic");
        const tx = bundle.unsignedTx.getTx() as Parameters<typeof futils.getInputAmounts>[0];
        const fee = atomicTxFee(bundle.unsignedTx, context);
        const inputs = futils.getInputAmounts(tx).get(context.avaxAssetID);
        const outputs = futils.getOutputAmounts(tx).get(context.avaxAssetID);
        expect(inputs, `${policy.feePrice}: every spendable UTXO is spent`).to.equal(total);
        expect(outputs, `${policy.feePrice}: one exported output, no change`).to.equal(total - fee);
        expect(await maxExportPCAmount(env, account, policy), `${policy.feePrice}: interactive default`).to.equal(
          total - fee
        );
      }
    });

    it("needs more than the 0.001 FLR the previous default subtracted, which therefore always fell short", async () => {
      const context = await env.clients.context();
      const { utxos } = await env.clients.pvm.getUTXOs({ addresses: [account.pAddress] });
      const total = spendableAmount(utxos, context.avaxAssetID, now());
      const bundle = await buildTransaction({ type: "exportPC" }, env, account, IMMEDIATE_SIGNER_POLICY);
      if (bundle.kind !== "atomic") throw new Error("exportPC must be atomic");
      const fee = atomicTxFee(bundle.unsignedTx, context);
      expect(context.baseTxFee).to.equal(1_000_000n);
      expect(fee > context.baseTxFee, `fee ${fee} nFLR`).to.equal(true);
      await buildTransaction(
        { type: "exportPC", amount: total - context.baseTxFee },
        env,
        account,
        IMMEDIATE_SIGNER_POLICY
      ).then(
        () => expect.fail("the previous default amount should not be exportable"),
        (error: unknown) => expect(String(error)).to.match(/Insufficient funds/)
      );
    });
  });

  describe("allUtxos", () => {
    const fakeUtxo = (id: string) => ({ ID: () => id }) as unknown as Utxo;
    const page = (ids: string[], endUtxo: string) => ({
      numFetched: ids.length,
      utxos: ids.map(fakeUtxo),
      endIndex: { address: "P-x", utxo: endUtxo },
      encoding: "hex",
    });

    it("makes the plain query once when the first page is not full", async () => {
      const queries: unknown[] = [];
      const utxos = await allUtxos(
        (query) => {
          queries.push(query);
          return Promise.resolve(page(["a", "b"], "b"));
        },
        { addresses: ["P-x"] }
      );
      expect(utxos.map((u) => u.ID())).to.deep.equal(["a", "b"]);
      expect(queries).to.deep.equal([{ addresses: ["P-x"] }]); // byte-identical to the unpaginated call
    });

    it("follows endIndex past full pages and keeps a UTXO repeated at a boundary once", async () => {
      const first = Array.from({ length: UTXO_PAGE_SIZE }, (_, i) => `u${i}`);
      const pages = [page(first, `u${UTXO_PAGE_SIZE - 1}`), page([`u${UTXO_PAGE_SIZE - 1}`, "last"], "last")];
      const queries: { startIndex?: unknown }[] = [];
      const utxos = await allUtxos(
        (query) => {
          queries.push(query);
          return Promise.resolve(pages.shift()!);
        },
        { addresses: ["P-x"], sourceChain: "C" }
      );
      expect(utxos).to.have.length(UTXO_PAGE_SIZE + 1);
      expect(utxos.at(-1)!.ID()).to.equal("last");
      expect(queries[1]).to.deep.equal({
        addresses: ["P-x"],
        sourceChain: "C",
        startIndex: { address: "P-x", utxo: `u${UTXO_PAGE_SIZE - 1}` },
      });
    });
  });
});
