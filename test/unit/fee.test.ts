/**
 * The fee of atomic transactions: read from the built transaction, estimated
 * for the interactive default, and still required on the unsigned-file
 * (ForDefi) path. Runs offline against the recorded RPC fixtures.
 */
import { evm, type UnsignedTx } from "@flarenetwork/flarejs";
import { expect } from "chai";
import { getBytes } from "ethers";
import { createEnv } from "../../src/app/env";
import { estimateAtomicFee, underpricedFeeWarning } from "../../src/app/transactions";
import { accountFromPrivateKey } from "../../src/chain/keys";
import { asNFlr } from "../../src/chain/units";
import { buildTransaction } from "../../src/core/builders";
import { ESTIMATED_FEE_BASE_FEE_MULTIPLIER } from "../../src/core/builders/pchain";
import { atomicTxFee } from "../../src/core/fee";
import { bundleFromUnsignedTxJson, type UnsignedTxJson } from "../../src/core/files";
import {
  FILE_SIGNER_POLICY,
  IMMEDIATE_SIGNER_POLICY,
  type TxRequestOf,
  type UnsignedTxBundle,
} from "../../src/core/types";
import { describeFee } from "../../src/output";
import type { Stub } from "../characterization/rpc-replay";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { withReplay } from "../helpers/replay";

const ONE_FLR = asNFlr(1_000_000_000n);
const account = accountFromPrivateKey(getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`), "localflare");

/**
 * The C-chain base fee localflare reported when the scenarios were recorded (1 wei). exportCP-pk and importPC-pk
 * pass -f, so their recordings have no base fee lookup; these tests estimate the fee and need one.
 */
const baseFeeStub: Stub = { match: (_path, method) => method === "eth_baseFee", respond: () => "0x1" };

const atomicBytes = (bundle: UnsignedTxBundle): string =>
  bundle.kind === "atomic" ? Buffer.from(bundle.unsignedTx.toBytes()).toString("hex") : "";

describe("atomic transaction fees", function () {
  this.timeout(20_000);

  it("reads exactly the -f fee back from the recorded unsigned files (1 FLR)", async () => {
    for (const scenario of ["exportCP-file", "importPC-file"]) {
      const bundle = bundleFromUnsignedTxJson(readGolden(scenario).outcome.unsignedTxJson as UnsignedTxJson);
      const fee = await withReplay(scenario, async (env) =>
        bundle.kind === "atomic" ? atomicTxFee(bundle.unsignedTx, await env.clients.context()) : undefined
      );
      expect(fee, scenario).to.equal(ONE_FLR);
    }
  });

  it("estimates the fee a transaction pays without -f, and passing that estimate builds the same bytes", async () => {
    const requests: [string, TxRequestOf<"exportCP"> | TxRequestOf<"importPC">][] = [
      ["exportCP-pk", { type: "exportCP", amount: asNFlr(10n * ONE_FLR) }],
      ["importPC-pk", { type: "importPC" }],
    ];
    for (const [scenario, req] of requests) {
      await withReplay(
        scenario,
        async (env) => {
          const estimate = await estimateAtomicFee(req, env, account);
          // a real base-fee estimate: above zero and far below the 1 FLR the menu used to default to
          expect(estimate > 0n && estimate < ONE_FLR / 10n, `${scenario}: ${estimate} nFLR`).to.equal(true);
          const estimated = await buildTransaction(req, env, account, IMMEDIATE_SIGNER_POLICY);
          const explicit = await buildTransaction({ ...req, fee: estimate }, env, account, IMMEDIATE_SIGNER_POLICY);
          expect(atomicBytes(explicit), scenario).to.equal(atomicBytes(estimated));
        },
        [baseFeeStub]
      );
    }
  });

  it("covers twice the current base fee: exactly double what flarejs charges at the base fee itself", async () => {
    expect(ESTIMATED_FEE_BASE_FEE_MULTIPLIER).to.equal(2n);
    const amount = asNFlr(10n * ONE_FLR);
    for (const scenario of ["exportCP-pk", "importPC-pk"]) {
      await withReplay(
        scenario,
        async (env) => {
          const context = await env.clients.context();
          const baseFeeGwei = ((await env.clients.evm.getBaseFee()) + ONE_FLR - 1n) / ONE_FLR; // wei → gwei, rounded up
          let atBaseFee: UnsignedTx;
          let estimate: bigint;
          if (scenario === "exportCP-pk") {
            const nonce = BigInt(await env.clients.provider.getTransactionCount(account.cAddress));
            atBaseFee = evm.newExportTxFromBaseFee(
              context,
              baseFeeGwei,
              amount,
              context.pBlockchainID,
              account.cAddressBytes,
              [account.addressBytes],
              nonce
            );
            estimate = await estimateAtomicFee({ type: "exportCP", amount }, env, account);
          } else {
            const { utxos } = await env.clients.evm.getUTXOs({ sourceChain: "P", addresses: [account.cAddressBech] });
            atBaseFee = evm.newImportTxFromBaseFee(
              context,
              account.cAddressBytes,
              [account.addressBytes],
              utxos,
              context.pBlockchainID,
              baseFeeGwei
            );
            estimate = await estimateAtomicFee({ type: "importPC" }, env, account);
          }
          expect(estimate, scenario).to.equal(2n * atomicTxFee(atBaseFee, context));
        },
        [baseFeeStub]
      );
    }
  });

  it("still requires -f for exportCP and importPC on the unsigned-file (ForDefi) path, before any node call", async () => {
    // a closed port: reaching the node would fail with a connection error instead
    const env = createEnv("localflare", { apiUrl: "http://127.0.0.1:1" });
    try {
      for (const req of [{ type: "exportCP", amount: ONE_FLR } as const, { type: "importPC" } as const]) {
        await buildTransaction(req, env, account, FILE_SIGNER_POLICY).then(
          () => expect.fail(`${req.type} was built without a fee on the file path`),
          (error: unknown) =>
            expect(String(error)).to.include(
              `fee is required for ${req.type} transaction. Use --fee <fee> to specify the fee`
            )
        );
      }
    } finally {
      env.clients.provider.destroy();
    }
  });

  it("warns about a typed fee below the cost at the current base fee (half the 2x estimate)", () => {
    const estimate = asNFlr(22_460n); // 11,230 gas at 2 x 1 gwei
    expect(underpricedFeeWarning(asNFlr(11_229n), estimate, "LFLR")).to.equal(
      "A fee of 0.000011229 LFLR is below the 0.00001123 LFLR this transaction costs at the current base fee; " +
        "the node will reject it unless the base fee drops first"
    );
    expect(underpricedFeeWarning(asNFlr(11_230n), estimate, "LFLR")).to.equal(undefined); // exactly the base fee cost
    expect(underpricedFeeWarning(estimate, estimate, "LFLR")).to.equal(undefined);
    expect(underpricedFeeWarning(ONE_FLR, estimate, "LFLR")).to.equal(undefined);
  });

  it("describes the fee as paid once sent and as to be burned for an unsigned file", () => {
    expect(
      describeFee({ status: "sent", txId: "x", chainStatus: "Accepted", fee: asNFlr(5_678_000n) }, "FLR")
    ).to.equal("Fee paid: 0.005678 FLR");
    expect(describeFee({ status: "pending", id: "x", forDefiHash: "h", file: "f", fee: ONE_FLR }, "C2FLR")).to.equal(
      "Fee: 1 C2FLR (burned when the signed transaction is sent)"
    );
    expect(describeFee({ status: "sent", txId: "0xabc", chainStatus: "Confirmed" }, "FLR")).to.equal(undefined);
  });
});
