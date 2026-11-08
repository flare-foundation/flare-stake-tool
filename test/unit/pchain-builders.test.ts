/**
 * P-chain builder details that need chain data: exporting the whole balance
 * (exportPC without -a), importing only the UTXOs the account can spend alone
 * (importPC), paying a transfer's recipient, the owners and auto-compounding of
 * auto-renewed validators, following getUTXOs pagination, and checking P-chain
 * addresses.
 * Offline, against recorded sessions and scripted nodes.
 */
import {
  BigIntPr,
  Id,
  Int,
  OutputOwners,
  TransferOutput,
  TransferableInput,
  TransferableOutput,
  Utxo,
  avaxSerial,
  evm,
  messageHashFromUnsignedTx,
  pvm,
  pvmSerial,
  utils as futils,
  type UnsignedTx,
} from "@flarenetwork/flarejs";
import { expect } from "chai";
import { getBytes } from "ethers";
import { accountFromPrivateKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { asNFlr, formatFlr, type NFlr } from "../../src/chain/units";
import { buildTransaction } from "../../src/core/builders";
import {
  C_ATOMIC_GAS_LIMIT,
  IMPORT_PC_INPUT_GAS,
  UTXO_PAGE_SIZE,
  allUtxos,
  maxExportPCAmount,
  spendableAmount,
} from "../../src/core/builders/pchain";
import { atomicTxFee } from "../../src/core/fee";
import { unsignedTxJsonFromBundle } from "../../src/core/files";
import { executeTransaction } from "../../src/core/pipeline";
import {
  FILE_SIGNER_POLICY,
  IMMEDIATE_SIGNER_POLICY,
  chainOfAtomicTx,
  type AtomicTxType,
  type Env,
  type Signer,
  type TxRequest,
  type TxRequestOf,
  type UnsignedTxBundle,
} from "../../src/core/types";
import { PrivateKeySigner } from "../../src/signers/privateKey";
import type { Stub } from "../characterization/rpc-replay";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { startReplay, withReplay, type Replay, type ReplayEnv } from "../helpers/replay";

const account = accountFromPrivateKey(getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`), "localflare");
type OutputsTx = Parameters<typeof futils.getOutputAmounts>[0];
/** The native amount a built transaction's outputs hold. */
const outputAmount = (unsignedTx: UnsignedTx, avaxAssetID: string) =>
  futils.getOutputAmounts(unsignedTx.getTx() as OutputsTx).get(avaxAssetID);
const now = () => BigInt(Math.floor(Date.now() / 1000));
/** 10 billion FLR: two of these fit in uint64 each, but not their sum. */
const TEN_BILLION_FLR = 10n ** 19n;
const overUint64 = (what: string, symbol: string, hint = "") =>
  new RegExp(
    `^${what} of 1\\d{10}\\.\\d+ ${symbol} is more than a transaction can hold \\(18446744073\\.709551615 ${symbol}\\); ` +
      `it is not signed${hint}$`
  );

/** `unsignedTx` in a bundle as the builders make it, to compare unsigned files. */
const atomicBundle = (txType: AtomicTxType, unsignedTx: UnsignedTx): UnsignedTxBundle => ({
  kind: "atomic",
  chain: chainOfAtomicTx(txType),
  txType,
  unsignedTx,
  digest: messageHashFromUnsignedTx(unsignedTx),
});

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
      // the recorded account's six UTXOs, all its own and unlocked: a fixed number, not the function under test
      const total = 8_000_000_118_960_442_173n;
      expect(spendableAmount(utxos, context.avaxAssetID, now())).to.equal(total);
      for (const policy of [IMMEDIATE_SIGNER_POLICY, FILE_SIGNER_POLICY]) {
        const bundle = await buildTransaction({ type: "exportPC" }, env, account, policy);
        if (bundle.kind !== "atomic") throw new Error("exportPC must be atomic");
        const tx = bundle.unsignedTx.getTx() as Parameters<typeof futils.getInputAmounts>[0];
        const fee = atomicTxFee(bundle.unsignedTx, context);
        const inputs = futils.getInputAmounts(tx).get(context.avaxAssetID);
        const outputs = futils.getOutputAmounts(tx).get(context.avaxAssetID);
        expect(inputs, `${policy.feePrice}: every spendable UTXO is spent`).to.equal(total);
        expect(outputs, `${policy.feePrice}: the export is the total minus the fee`).to.equal(total - fee);
        const exportTx = bundle.unsignedTx.getTx() as pvmSerial.ExportTx;
        expect(exportTx.baseTx.outputs, `${policy.feePrice}: no change output`).to.have.length(0);
        expect(exportTx.outs, `${policy.feePrice}: one exported output`).to.have.length(1);
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
        { type: "exportPC", amount: asNFlr(total - context.baseTxFee) },
        env,
        account,
        IMMEDIATE_SIGNER_POLICY
      ).then(
        () => expect.fail("the previous default amount should not be exportable"),
        (error: unknown) => expect(String(error)).to.match(/Insufficient funds/)
      );
    });

    /** A P-chain UTXO of `amount` nFLR that the account can spend alone, time-locked until `locktime` if given. */
    async function owned(amount: bigint, index: number, locktime = 0n): Promise<Utxo> {
      const { avaxAssetID } = await env.clients.context();
      return new Utxo(
        new avaxSerial.UTXOID(Id.fromHex(`0x${(index + 1).toString(16).padStart(64, "0")}`), new Int(index % 7)),
        Id.fromString(avaxAssetID),
        new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative([account.addressBytes], locktime, 1))
      );
    }

    /** A P-chain UTXO of `amount` nFLR the account owns, stakeable-locked until `lockTime`, without an owner lock. */
    async function stakeable(amount: bigint, index: number, lockTime: bigint): Promise<Utxo> {
      const { avaxAssetID } = await env.clients.context();
      return new Utxo(
        new avaxSerial.UTXOID(Id.fromHex(`0x${(index + 1).toString(16).padStart(64, "0")}`), new Int(index % 7)),
        Id.fromString(avaxAssetID),
        new pvmSerial.StakeableLockOut(
          new BigIntPr(lockTime),
          new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative([account.addressBytes], 0n, 1))
        )
      );
    }

    /** The recorded context and fee state, with `utxos` on the P-chain and the gas capacity set to `capacity`. */
    function pChainEnv(utxos: Utxo[], capacity?: bigint): Env {
      const clients = {
        context: () => env.clients.context(),
        pvm: {
          getFeeState: async () => ({ ...(await env.clients.pvm.getFeeState()), ...(capacity && { capacity }) }),
          getUTXOs: () => Promise.resolve({ numFetched: utxos.length, utxos, endIndex: { address: "", utxo: "" } }),
        },
      };
      return { network: env.network, clients } as unknown as Env;
    }

    const POLICIES = [IMMEDIATE_SIGNER_POLICY, FILE_SIGNER_POLICY] as const;

    /** Builds exportPC without -a; returns its parts and the fee flarejs requires of it at the policy's price. */
    async function exportAll(utxos: Utxo[], policy: (typeof POLICIES)[number], capacity?: bigint) {
      const context = await env.clients.context();
      const bundle = await buildTransaction({ type: "exportPC" }, pChainEnv(utxos, capacity), account, policy);
      if (bundle.kind !== "atomic") throw new Error("exportPC must be atomic");
      const tx = bundle.unsignedTx.getTx() as pvmSerial.ExportTx;
      const price = policy.feePrice === "chain" ? (await env.clients.pvm.getFeeState()).price : policy.feePrice;
      const amountsOf = (outputs: readonly TransferableOutput[]) =>
        outputs.map((o) => (o.output as TransferOutput).amount());
      return {
        spent: tx.baseTx.inputs.map((input) => input.utxoID.txID.toString()),
        change: amountsOf(tx.baseTx.outputs),
        exported: amountsOf(tx.outs),
        fee: atomicTxFee(bundle.unsignedTx, context),
        required: pvm.calculateFee(tx, context.platformFeeConfig.weights, price),
        notices: bundle.notices ?? [],
      };
    }

    it("spends every UTXO and pays exactly the fee flarejs requires: 1, 6 and 200 inputs", async () => {
      const sets = {
        one: [await owned(5_000_000_000n, 0)],
        six: await Promise.all([1n, 2n, 3n, 4n, 5n, 6n].map((n, i) => owned(n * 1_000_000_000n, i))),
        "200": await Promise.all(Array.from({ length: 200 }, (_, i) => owned(BigInt(i + 1) * 10_000_000n, i))),
      };
      for (const [name, utxos] of Object.entries(sets)) {
        const total = utxos.reduce((sum, u) => sum + (u.output as TransferOutput).amount(), 0n);
        for (const policy of POLICIES) {
          const built = await exportAll(utxos, policy);
          const label = `${name} @${policy.feePrice}`;
          expect(built.spent, label).to.have.length(utxos.length);
          expect(built.change, `${label}: no change`).to.deep.equal([]);
          expect(built.fee, `${label}: the fee required at this price, no more`).to.equal(built.required);
          expect(built.exported, label).to.deep.equal([total - built.fee]);
        }
      }
    });

    it("leaves out dust, worth less than its input's fee at the lowest price, and exports the rest with no change", async () => {
      const big = await owned(100_000_000_000n, 0); // 100 FLR
      const dust = await owned(200_000n, 1); // 0.0002 FLR; the line is 2,961 gas × 250 = 0.00074 FLR
      for (const policy of POLICIES) {
        const built = await exportAll([dust, big], policy);
        const label = `@${policy.feePrice}`;
        expect(built.spent, `${label}: only the 100 FLR UTXO`).to.deep.equal([big.utxoId.txID.toString()]);
        expect(built.fee, label).to.equal(built.required);
        expect(built.change, `${label}: no change`).to.deep.equal([]);
        expect(built.exported, label).to.deep.equal([100_000_000_000n - built.fee]);
        expect(built.notices, label).to.deep.equal([
          `1 UTXO(s) (0.0002 ${env.network.symbol}) left out: each is worth less than the fee of spending it`,
        ]);
      }
    });

    it("refuses an export of UTXOs that each fit in uint64 but whose sum does not; part of it with -a builds", async () => {
      const utxos = [await owned(TEN_BILLION_FLR, 0), await owned(TEN_BILLION_FLR, 1)];
      for (const policy of POLICIES) {
        await buildTransaction({ type: "exportPC" }, pChainEnv(utxos), account, policy).then(
          () => expect.fail("built an export above uint64"),
          (error: unknown) =>
            expect((error as Error).message).to.match(
              overUint64("The export", env.network.symbol, "; export part of it with -a")
            )
        );
      }
      const part = { type: "exportPC", amount: asNFlr(TEN_BILLION_FLR) } as const;
      expect((await buildTransaction(part, pChainEnv(utxos), account, IMMEDIATE_SIGNER_POLICY)).kind).to.equal(
        "atomic"
      );
    });

    it("builds when spending every UTXO would exceed the gas capacity but the export does not", async () => {
      const big = await owned(100_000_000_000n, 0); // 100 FLR
      // 0.001 FLR each: above the dust line, but at the file price each costs 0.003 FLR to spend, so flarejs leaves
      // them out of the export, while the fee probe spends them all
      const small = await Promise.all(Array.from({ length: 400 }, (_, i) => owned(1_000_000n, i + 1)));
      const built = await exportAll([big, ...small], FILE_SIGNER_POLICY, 1_000_000n);
      expect(built.spent, "only the 100 FLR UTXO").to.deep.equal([big.utxoId.txID.toString()]);
      expect(built.fee).to.equal(built.required);
      expect(built.exported[0]! + built.fee + built.change[0]!).to.equal(100_000_000_000n);
      expect(built.notices, "not dust").to.deep.equal([]);
    });

    it("transfers and delegates past dust in front of the funds, plain or stakeable-locked, which used to go over the gas capacity", async () => {
      const funds = await owned(100_000_000_000n, 400); // 100 FLR
      // 400 × 1 nFLR, listed first. Anyone can send stakeable-locked outputs too; with a lock that ended long ago, a
      // signer sending now spends them as unlocked funds, and a file (locks checked at time 1) stakes them as locked
      const dustSets = {
        plain: await Promise.all(Array.from({ length: 400 }, (_, i) => owned(1n, i))),
        "stakeable-locked": await Promise.all(Array.from({ length: 400 }, (_, i) => stakeable(1n, i, 2n))),
      };
      const requests = [
        { type: "transfer", amount: asNFlr(5_000_000_000n), to: account.pAddress },
        {
          type: "delegate",
          nodeId: "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ",
          amount: asNFlr(50_000_000_000n),
          startTime: 1_900_000_000n,
          endTime: 1_900_086_400n,
        },
      ] as const;
      for (const [kind, dust] of Object.entries(dustSets)) {
        for (const policy of POLICIES) {
          for (const request of requests) {
            const label = `${kind} dust, ${request.type} @${policy.feePrice}`;
            const bundle = await buildTransaction(request, pChainEnv([...dust, funds], 1_000_000n), account, policy);
            if (bundle.kind !== "atomic") throw new Error(`${label}: not a P-chain transaction`);
            const { inputs } = (bundle.unsignedTx.getTx() as unknown as { baseTx: { inputs: TransferableInput[] } })
              .baseTx;
            expect(
              inputs.map((input) => input.utxoID.txID.toString()),
              label
            ).to.deep.equal([funds.utxoId.txID.toString()]);
            expect(bundle.notices, label).to.deep.equal([
              `400 UTXO(s) (${formatFlr(asNFlr(400n))} ${env.network.symbol}) left out: each is worth less than the fee of spending it`,
            ]);
          }
        }
      }
    });

    it("measures a stakeable-locked UTXO by the input flarejs spends it with: locked while its lock runs, plain after", async () => {
      // one input's fee at the lowest price (250): plain 2,961 gas, stakeable-locked 2,973 gas
      const plainLine = 2_961n * 250n; // 740,250 nFLR
      const lockedLine = 2_973n * 250n; // 743,250 nFLR
      const funds = await owned(100_000_000_000n, 10);
      const transfer = { type: "transfer", amount: asNFlr(1_000_000_000n), to: account.pAddress } as const;
      const leftOut = async (amount: bigint, policy: (typeof POLICIES)[number]) => {
        const bundle = await buildTransaction(
          transfer,
          pChainEnv([await stakeable(amount, 0, 2n), funds]),
          account,
          policy
        );
        if (bundle.kind !== "atomic") throw new Error("transfer must be a P-chain transaction");
        return (bundle.notices ?? []).length > 0;
      };
      // the lock ended long ago: a signer sending now spends the UTXO with a plain input
      expect(await leftOut(plainLine, IMMEDIATE_SIGNER_POLICY), "sent now, worth the plain input's fee").to.equal(
        false
      );
      expect(await leftOut(plainLine - 1n, IMMEDIATE_SIGNER_POLICY), "sent now, worth less").to.equal(true);
      // a file checks locks at time 1, so the lock still runs: a stakeable-locked input
      expect(await leftOut(plainLine, FILE_SIGNER_POLICY), "file, worth the plain input's fee").to.equal(true);
      expect(await leftOut(lockedLine, FILE_SIGNER_POLICY), "file, worth the locked input's fee").to.equal(false);
    });

    it("refuses an export that itself exceeds the gas capacity", async () => {
      const utxos = await Promise.all(Array.from({ length: 400 }, (_, i) => owned(1_000_000_000n, i))); // 400 × 1 FLR
      for (const policy of POLICIES) {
        await buildTransaction({ type: "exportPC" }, pChainEnv(utxos, 1_000_000n), account, policy).then(
          () => expect.fail(`@${policy.feePrice}: built an export over the gas capacity`),
          (error: unknown) => expect(String(error)).to.match(/exceeds capacity \(1000000\)/)
        );
      }
    });

    it("refuses to export when the balance cannot pay the fee", async () => {
      const utxos = [await owned(1n, 0)];
      await buildTransaction({ type: "exportPC" }, pChainEnv(utxos), account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("exported from 1 nFLR"),
        (error: unknown) => expect(String(error)).to.include("Export amount is smaller than or equal to zero")
      );
    });

    it("refuses to export when nothing is spendable", async () => {
      // the calls the P-chain builders gather their inputs with: here, no UTXOs at all
      const clients = {
        context: () => replay.env.clients.context(),
        pvm: {
          getFeeState: () => replay.env.clients.pvm.getFeeState(),
          getUTXOs: () => Promise.resolve({ numFetched: 0, utxos: [], endIndex: { address: "", utxo: "" } }),
        },
      };
      const empty = { network: replay.env.network, clients } as unknown as Env;
      await buildTransaction({ type: "exportPC" }, empty, account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("exported from an empty account"),
        (error: unknown) => expect(String(error)).to.include("Export amount is smaller than or equal to zero")
      );
    });

    describe("time locks", () => {
      const UNLOCK = 1_900_000_000n; // the second a time lock ends
      const realNow = Date.now;
      afterEach(() => {
        Date.now = realNow;
      });

      /** Builds a transfer of 5 FLR and exportPC without -a at clock time `seconds`; returns their bytes and inputs. */
      async function buildAt(seconds: bigint, utxos: Utxo[], policy: (typeof POLICIES)[number]) {
        Date.now = () => Number(seconds) * 1000;
        const requests = [
          { type: "transfer", amount: asNFlr(5_000_000_000n), to: account.pAddress },
          { type: "exportPC" },
        ] as const;
        const built = [];
        for (const request of requests) {
          const bundle = await buildTransaction(request, pChainEnv(utxos), account, policy);
          if (bundle.kind !== "atomic") throw new Error(`${request.type} must be a P-chain transaction`);
          const { inputs } = (bundle.unsignedTx.getTx() as unknown as { baseTx: { inputs: TransferableInput[] } })
            .baseTx;
          built.push({
            bytes: Buffer.from(bundle.unsignedTx.toBytes()).toString("hex"),
            spent: inputs.map((input) => input.utxoID.txID.toString()),
          });
        }
        return built;
      }

      it("unsigned files pick the same inputs on either side of a lock's end; an immediate signer waits for it", async () => {
        const locked = await owned(50_000_000_000n, 0, UNLOCK); // 50 FLR, first in line
        const free = await owned(10_000_000_000n, 1); // 10 FLR
        const lockedId = locked.utxoId.txID.toString();
        const utxos = [locked, free];

        const fileBefore = await buildAt(UNLOCK - 1n, utxos, FILE_SIGNER_POLICY);
        const fileAfter = await buildAt(UNLOCK + 3600n, utxos, FILE_SIGNER_POLICY);
        expect(
          fileAfter.map((b) => b.bytes),
          "same transactions an hour apart"
        ).to.deep.equal(fileBefore.map((b) => b.bytes));
        for (const built of fileAfter) expect(built.spent, "file: never the time-locked UTXO").not.to.include(lockedId);

        const [transferAtEnd, exportAtEnd] = await buildAt(UNLOCK, utxos, IMMEDIATE_SIGNER_POLICY);
        expect(transferAtEnd!.spent, "immediate, at the lock's second: still locked").to.deep.equal([
          free.utxoId.txID.toString(),
        ]);
        expect(exportAtEnd!.spent, "immediate, at the lock's second: still locked").not.to.include(lockedId);
        const [transferAfter, exportAfter] = await buildAt(UNLOCK + 1n, utxos, IMMEDIATE_SIGNER_POLICY);
        expect(transferAfter!.spent, "immediate, a second later").to.deep.equal([lockedId]);
        expect(exportAfter!.spent, "immediate, a second later").to.include(lockedId);
      });

      /** A P-chain UTXO of `amount` nFLR the account owns, stakeable-locked until UNLOCK, without an owner lock. */
      async function stakeableLocked(amount: bigint): Promise<Utxo> {
        const { avaxAssetID } = await env.clients.context();
        return new Utxo(
          new avaxSerial.UTXOID(Id.fromHex(`0x${"ab".repeat(32)}`), new Int(0)),
          Id.fromString(avaxAssetID),
          new pvmSerial.StakeableLockOut(
            new BigIntPr(UNLOCK),
            new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative([account.addressBytes], 0n, 1))
          )
        );
      }

      it("unsigned files stake a stakeable-locked UTXO with its lock on either side of the lock's end, the fee paid from unlocked funds", async () => {
        const locked = await stakeableLocked(50_000_000_000n); // 50 FLR
        const free = await owned(1_000_000_000n, 1); // 1 FLR, for the fee
        const delegateAt = async (seconds: bigint, policy: (typeof POLICIES)[number]) => {
          Date.now = () => Number(seconds) * 1000;
          const request = {
            type: "delegate",
            nodeId: "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ",
            amount: asNFlr(50_000_000_000n),
            startTime: UNLOCK + 7_200n,
            endTime: UNLOCK + 86_400n,
          } as const;
          const bundle = await buildTransaction(request, pChainEnv([locked, free]), account, policy);
          if (bundle.kind !== "atomic") throw new Error("delegate must be a P-chain transaction");
          const tx = bundle.unsignedTx.getTx() as pvmSerial.AddPermissionlessDelegatorTx;
          return {
            bytes: Buffer.from(bundle.unsignedTx.toBytes()).toString("hex"),
            spent: tx.baseTx.inputs.map((input) => input.utxoID.txID.toString()),
            stakedLocked: tx.stake.map((output) => output.output instanceof pvmSerial.StakeableLockOut),
          };
        };

        const before = await delegateAt(UNLOCK - 1n, FILE_SIGNER_POLICY);
        const after = await delegateAt(UNLOCK + 3600n, FILE_SIGNER_POLICY);
        expect(after.bytes, "same transaction an hour apart").to.equal(before.bytes);
        expect(after.spent, "the locked UTXO staked, the free one for the fee").to.have.members([
          locked.utxoId.txID.toString(),
          free.utxoId.txID.toString(),
        ]);
        expect(after.stakedLocked, "the stake keeps the lock").to.deep.equal([true]);

        const immediate = await delegateAt(UNLOCK + 1n, IMMEDIATE_SIGNER_POLICY);
        expect(immediate.stakedLocked, "immediate, once the lock has ended: staked as unlocked funds").to.deep.equal([
          false,
        ]);
      });

      it("counts only AVAX the account can spend alone: not a UTXO needing two keys, nor another asset", async () => {
        const { avaxAssetID } = await env.clients.context();
        const other = accountFromPrivateKey(getBytes(`0x${"11".repeat(32)}`), "localflare");
        const utxo = (index: number, assetId: string, owners: Uint8Array[], threshold: number, amount: bigint) =>
          new Utxo(
            new avaxSerial.UTXOID(Id.fromHex(`0x${(index + 100).toString(16).padStart(64, "0")}`), new Int(0)),
            Id.fromString(assetId),
            new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative(owners, 0n, threshold))
          );
        const otherAsset = Id.fromHex(`0x${"ab".repeat(32)}`).toString();
        const both = [account.addressBytes, other.addressBytes];
        const utxos = [
          utxo(0, avaxAssetID, [account.addressBytes], 1, 1_000n),
          utxo(1, avaxAssetID, both, 2, 20_000n), // needs both keys
          utxo(2, avaxAssetID, both, 1, 300n), // either key
          utxo(3, otherAsset, [account.addressBytes], 1, 4_000_000n),
        ];
        expect(spendableAmount(utxos, avaxAssetID, UNLOCK)).to.equal(1_300n);
      });

      it("counts a UTXO as spendable from the second flarejs spends it, for owner and stakeable locks", async () => {
        const { avaxAssetID } = await env.clients.context();
        const ownerLocked = await owned(1_000n, 0, UNLOCK);
        const utxos = [ownerLocked, await stakeableLocked(2_000n)];
        expect(spendableAmount(utxos, avaxAssetID, UNLOCK)).to.equal(0n);
        expect(spendableAmount(utxos, avaxAssetID, UNLOCK + 1n)).to.equal(3_000n);
      });
    });
  });

  describe("importPC", () => {
    let replay: Replay;
    beforeEach(async () => {
      replay = await startReplay("importPC-pk");
    });
    afterEach(() => replay.close());

    const other = accountFromPrivateKey(getBytes(`0x${"11".repeat(32)}`), "localflare");
    const FEE = asNFlr(10_000_000n); // 0.01 FLR

    /** A P→C export output of `amount` nFLR held by `owners`, `threshold` of them needed, locked until `locktime`. */
    async function exported(owners: Uint8Array[], threshold: number, amount: bigint, index: number, locktime = 0n) {
      const { avaxAssetID } = await replay.env.clients.context();
      return new Utxo(
        new avaxSerial.UTXOID(Id.fromHex(`0x${String(index + 1).padStart(64, "0")}`), new Int(index)),
        Id.fromString(avaxAssetID),
        new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative(owners, locktime, threshold))
      );
    }

    /** The recorded context, with `utxos` pending on the C-chain. */
    function pendingEnv(utxos: Utxo[]): Env {
      const recorded = replay.env.clients.evm;
      const clients = {
        context: () => replay.env.clients.context(),
        evm: {
          getUTXOs: () =>
            Promise.resolve({ numFetched: utxos.length, utxos, endIndex: { address: "", utxo: "" }, encoding: "hex" }),
          getBaseFee: () => Promise.resolve(25_000_000_000n),
          // sending: the replay answers with the recorded import's id and status, whatever is sent
          issueSignedTx: (tx: Parameters<typeof recorded.issueSignedTx>[0]) => recorded.issueSignedTx(tx),
          getAtomicTxStatus: (txId: string) => recorded.getAtomicTxStatus(txId),
        },
      };
      return { network: replay.env.network, clients } as unknown as Env;
    }

    const importedInputs = (bundle: { unsignedTx: { getTx: () => unknown } }) =>
      (bundle.unsignedTx.getTx() as { importedInputs: unknown[] }).importedInputs.length;

    it("imports only what the account can spend alone, and pays the fee given even with a co-owned UTXO in front", async () => {
      const utxos = [
        await exported([account.addressBytes, other.addressBytes], 2, 5_000_000_000n, 0), // needs both keys
        await exported([account.addressBytes], 1, 3_000_000_000n, 1, now() + 86_400n), // locked for a day
        await exported([account.addressBytes], 1, 10_000_000_000n, 2),
      ];
      const env = pendingEnv(utxos);
      const context = await env.clients.context();
      const given = await buildTransaction({ type: "importPC", fee: FEE }, env, account, IMMEDIATE_SIGNER_POLICY);
      const estimated = await buildTransaction({ type: "importPC" }, env, account, IMMEDIATE_SIGNER_POLICY);
      if (given.kind !== "atomic" || estimated.kind !== "atomic") throw new Error("not an atomic transaction");
      expect(importedInputs(given)).to.equal(1);
      expect(importedInputs(estimated)).to.equal(1);
      expect(atomicTxFee(given.unsignedTx, context)).to.equal(FEE); // flarejs alone built one that paid 0
      expect(atomicTxFee(estimated.unsignedTx, context) > 0n).to.equal(true);
    });

    it("refuses before signing a fee the import would not pay exactly, and an estimate that pays nothing", async () => {
      const utxos = [await exported([account.addressBytes], 1, 1_000_000_000n, 0)];
      // more than the import holds: flarejs builds one paying all of it, 1 LFLR, with no output
      const tooMuch = { type: "importPC", fee: asNFlr(5_000_000_000n) } as const;
      await buildTransaction(tooMuch, pendingEnv(utxos), account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("built an import paying another fee than -f"),
        (error: unknown) =>
          expect((error as Error).message).to.equal(
            "The import would pay a fee of 1 LFLR instead of the 5 LFLR given; it is not signed"
          )
      );
      // a base fee of 0 estimates a fee of 0
      const zeroBaseFee = pendingEnv(utxos);
      (zeroBaseFee.clients.evm as unknown as { getBaseFee: () => Promise<bigint> }).getBaseFee = () =>
        Promise.resolve(0n);
      await buildTransaction({ type: "importPC" }, zeroBaseFee, account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("built an import paying nothing"),
        (error: unknown) =>
          expect((error as Error).message).to.equal("The import would pay a fee of 0 LFLR; it is not signed")
      );
    });

    it("refuses an import whose fee takes all it imports, estimated or given; the UTXOs stay pending", async () => {
      const context = await replay.env.clients.context();
      const value = asNFlr(10_000_000n); // 0.01 FLR
      const utxos = [await exported([account.addressBytes], 1, value, 0)];
      const refused = (req: TxRequest, env: Env) =>
        buildTransaction(req, env, account, IMMEDIATE_SIGNER_POLICY).then(
          () => expect.fail("built an import that delivers nothing"),
          (error: unknown) =>
            expect((error as Error).message).to.equal(
              `The fee takes all of the ${formatFlr(value)} ${replay.env.network.symbol} being imported, so nothing ` +
                "would arrive on the C-chain; it is not signed, and the UTXOs stay pending for a later import"
            )
        );
      // at the 500 gwei floor the estimate (1000 gwei a gas) is above 0.01 FLR, and flarejs cuts it to the value
      const atFloor = pendingEnv(utxos);
      (atFloor.clients.evm as unknown as { getBaseFee: () => Promise<bigint> }).getBaseFee = () =>
        Promise.resolve(500_000_000_000n);
      const cut = evm.newImportTxFromBaseFee(
        context,
        account.cAddressBytes,
        [account.addressBytes],
        utxos,
        context.pBlockchainID,
        1_000n
      );
      expect(atomicTxFee(cut, context), "flarejs alone: all of it is the fee").to.equal(value);
      expect(outputAmount(cut, context.avaxAssetID), "and the output is 0, which the chain refuses").to.equal(0n);
      await refused({ type: "importPC" }, atFloor);
      await refused({ type: "importPC", fee: value }, pendingEnv(utxos));
      // one nFLR less leaves a one-nFLR output, which is built
      const built = await buildTransaction(
        { type: "importPC", fee: asNFlr(value - 1n) },
        pendingEnv(utxos),
        account,
        IMMEDIATE_SIGNER_POLICY
      );
      if (built.kind !== "atomic") throw new Error("not an atomic transaction");
      expect(outputAmount(built.unsignedTx, context.avaxAssetID)).to.equal(1n);
    });

    it("refuses an import of UTXOs that each fit in uint64 but whose sum does not", async () => {
      const utxos = [0, 1].map((i) => exported([account.addressBytes], 1, TEN_BILLION_FLR, i));
      const env = pendingEnv(await Promise.all(utxos));
      await buildTransaction({ type: "importPC", fee: FEE }, env, account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("built an import above uint64"),
        (error: unknown) =>
          expect((error as Error).message).to.match(overUint64("The import", replay.env.network.symbol))
      );
    });

    it("leaves a time-locked UTXO pending even once its lock has passed, which flarejs cannot import", async () => {
      const expired = await exported([account.addressBytes], 1, 1_000_000_000n, 0, 1n); // locked until 1970
      const env = pendingEnv([expired, await exported([account.addressBytes], 1, 10_000_000_000n, 1)]);
      const built = await buildTransaction({ type: "importPC", fee: FEE }, env, account, IMMEDIATE_SIGNER_POLICY);
      if (built.kind !== "atomic") throw new Error("not an atomic transaction");
      expect(importedInputs(built)).to.equal(1);
      expect(atomicTxFee(built.unsignedTx, await env.clients.context())).to.equal(FEE); // flarejs alone paid 0
      await buildTransaction(
        { type: "importPC", fee: FEE },
        pendingEnv([expired]),
        account,
        IMMEDIATE_SIGNER_POLICY
      ).then(
        () => expect.fail("built an import"),
        (error: unknown) =>
          expect(String(error)).to.include(
            "(1 UTXO(s) need more signatures or have a time lock, which cannot be imported even once it has passed)"
          )
      );
    });

    it("refuses when nothing pending can be spent alone, and when nothing is pending", async () => {
      const refusal = (utxos: Utxo[], message: string) =>
        buildTransaction({ type: "importPC", fee: FEE }, pendingEnv(utxos), account, IMMEDIATE_SIGNER_POLICY).then(
          () => expect.fail("built an import"),
          (error: unknown) => expect(String(error)).to.include(message)
        );
      await refusal(
        [await exported([account.addressBytes, other.addressBytes], 2, 5_000_000_000n, 0)],
        "Nothing to import from the P-chain that this account can spend alone (1 UTXO(s) need more signatures or have a time lock, which cannot be imported even once it has passed)"
      );
      await refusal([], "Nothing to import from the P-chain");
    });

    const ONE_FLR = 1_000_000_000n;
    /** The smallest UTXO worth importing: the fee its own input adds at the 500 gwei base fee floor. */
    const WORTH_IMPORTING = IMPORT_PC_INPUT_GAS * 500n;

    /** `count` UTXOs the account can spend alone, the i-th of `amount(i)` nFLR, from index `first` on. */
    const many = (count: number, amount: (i: number) => bigint, first = 0) =>
      Promise.all(Array.from({ length: count }, (_, i) => exported([account.addressBytes], 1, amount(i), first + i)));

    /** Builds importPC (estimated without `fee`); returns its bytes, imported amounts and ids, gas and notices. */
    async function importPC(env: Env, fee?: NFlr, policy = IMMEDIATE_SIGNER_POLICY) {
      const bundle = await buildTransaction({ type: "importPC", fee }, env, account, policy);
      if (bundle.kind !== "atomic") throw new Error("importPC must be atomic");
      const { importedInputs } = bundle.unsignedTx.getTx() as unknown as { importedInputs: TransferableInput[] };
      return {
        bytes: Buffer.from(bundle.unsignedTx.toBytes()).toString("hex"),
        amounts: importedInputs.map((input) => input.amount()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)),
        ids: importedInputs.map((input) => input.utxoID.ID()),
        gas: futils.costCorethTx(bundle.unsignedTx),
        fee: atomicTxFee(bundle.unsignedTx, await env.clients.context()),
        notices: bundle.notices ?? [],
      };
    }

    it("each UTXO adds IMPORT_PC_INPUT_GAS to the import", async () => {
      const utxos = await many(2, () => ONE_FLR);
      const one = await importPC(pendingEnv(utxos.slice(0, 1)), FEE);
      const two = await importPC(pendingEnv(utxos), FEE);
      expect(two.gas - one.gas).to.equal(IMPORT_PC_INPUT_GAS);
    });

    it("skips UTXOs worth less than the fee of importing them, and builds the same import with or without -f", async () => {
      const symbol = replay.env.network.symbol;
      const dust = await many(100, () => WORTH_IMPORTING - 1n, 2);
      const utxos = [...dust, await exported([account.addressBytes], 1, 10n * ONE_FLR, 0)];
      utxos.push(await exported([account.addressBytes], 1, WORTH_IMPORTING, 1)); // just worth it
      const env = pendingEnv(utxos);

      const estimated = await importPC(env);
      expect(estimated.amounts).to.deep.equal([10n * ONE_FLR, WORTH_IMPORTING]);
      expect(estimated.notices).to.deep.equal([
        `100 UTXO(s) (${formatFlr(asNFlr(100n * (WORTH_IMPORTING - 1n)))} ${symbol}) skipped: each is worth less than the fee of importing it, and stays pending`,
      ]);
      const given = await importPC(env, estimated.fee);
      const file = await importPC(env, estimated.fee, FILE_SIGNER_POLICY);
      expect(given.bytes, "-f the estimate").to.equal(estimated.bytes);
      expect(file.bytes, "unsigned file, -f the estimate").to.equal(estimated.bytes);
      expect(given.notices).to.deep.equal(estimated.notices);
    });

    it("takes the largest UTXOs the C-chain's atomic gas limit allows; the rest stay pending for a later import", async () => {
      const symbol = replay.env.network.symbol;
      const utxos = await many(150, (i) => BigInt(i + 1) * ONE_FLR); // 1 to 150 FLR, smallest first
      const env = pendingEnv(utxos);

      const given = await importPC(env, FEE);
      const taken = given.amounts.length;
      expect(given.gas <= C_ATOMIC_GAS_LIMIT, `gas ${given.gas}`).to.equal(true);
      expect(given.gas + IMPORT_PC_INPUT_GAS > C_ATOMIC_GAS_LIMIT, "one more would not fit").to.equal(true);
      const largest = Array.from({ length: taken }, (_, i) => BigInt(150 - i) * ONE_FLR);
      expect(given.amounts).to.deep.equal(largest);
      const left = 150 - taken;
      const leftAmount = asNFlr((BigInt(left * (left + 1)) / 2n) * ONE_FLR);
      expect(given.notices).to.deep.equal([
        `${left} UTXO(s) (${formatFlr(leftAmount)} ${symbol}) stay pending for a later import: the C-chain's atomic gas limit fits only ${taken} in one`,
      ]);
      expect((await importPC(env)).amounts, "estimated").to.deep.equal(largest);
    });

    it("takes equal UTXOs over the limit by id in plain string order, whatever order the node lists them in", async () => {
      // ids starting with N-Z come before a-m in plain order (the same on every machine) and after them in a
      // locale's order, so the two take different UTXOs
      const candidates = await many(1000, () => ONE_FLR);
      const utxos = [
        ...candidates.filter((utxo) => /^[N-Z]/.test(utxo.ID())).slice(0, 75),
        ...candidates.filter((utxo) => /^[a-m]/.test(utxo.ID())).slice(0, 75),
      ];
      expect(utxos).to.have.length(150);
      const plain = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      const byId = utxos.map((utxo) => utxo.ID()).sort(plain);
      const listed = await importPC(pendingEnv(utxos), FEE);
      const reversed = await importPC(pendingEnv([...utxos].reverse()), FEE);
      expect(reversed.bytes).to.equal(listed.bytes);
      expect(listed.ids.length).to.be.above(75).and.below(150);
      expect([...listed.ids].sort(plain)).to.deep.equal(byId.slice(0, listed.ids.length));
    });

    it("refuses an import of nothing but UTXOs worth less than the fee of importing them", async () => {
      const symbol = replay.env.network.symbol;
      await buildTransaction(
        { type: "importPC", fee: FEE },
        pendingEnv(await many(3, () => 1_000n)),
        account,
        IMMEDIATE_SIGNER_POLICY
      ).then(
        () => expect.fail("built an import"),
        (error: unknown) =>
          expect(String(error)).to.include(
            `Nothing worth importing from the P-chain: 3 UTXO(s) (${formatFlr(asNFlr(3_000n))} ${symbol}), each worth less than the fee of importing it`
          )
      );
    });

    it("passes what it left out to the outcome, pending or sent, for the command line and interactive mode to print", async () => {
      const utxos = [...(await many(2, () => 1_000n, 1)), await exported([account.addressBytes], 1, ONE_FLR, 0)];
      const fileSigner: Signer = {
        kind: "file",
        policy: FILE_SIGNER_POLICY,
        account: () => Promise.resolve(account),
        sign: () => Promise.resolve({ status: "pending", id: "x", forDefiHash: "h", file: "f" }),
      };
      const keySigner = new PrivateKeySigner(getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`), replay.env.network.hrp);
      for (const signer of [fileSigner, keySigner]) {
        const outcome = await executeTransaction({ type: "importPC", fee: FEE }, pendingEnv(utxos), signer, {
          pollMs: 1,
        });
        expect(outcome.status).to.equal(signer === fileSigner ? "pending" : "sent");
        expect(outcome.notices, outcome.status).to.have.length(1);
        expect(outcome.notices![0], outcome.status).to.match(/^2 UTXO\(s\) .* skipped: /);
      }
    });

    it("builds an import that leaves nothing out exactly as flarejs builds it from the node's UTXOs, file included", async () => {
      const context = await replay.env.clients.context();
      const utxos = [
        await exported([account.addressBytes], 1, ONE_FLR, 0),
        await exported([account.addressBytes], 1, 2n * ONE_FLR, 1),
      ];
      const built = await buildTransaction(
        { type: "importPC", fee: FEE },
        pendingEnv(utxos),
        account,
        FILE_SIGNER_POLICY
      );
      const direct = evm.newImportTx(
        context,
        account.cAddressBytes,
        [account.addressBytes],
        utxos,
        context.pBlockchainID,
        FEE
      );
      expect(unsignedTxJsonFromBundle(built)).to.deep.equal(unsignedTxJsonFromBundle(atomicBundle("importPC", direct)));
    });
  });

  describe("importCP", () => {
    let replay: Replay;
    beforeEach(async () => {
      replay = await startReplay("importCP-pk");
    });
    afterEach(() => replay.close());

    const ONE_FLR = 1_000_000_000n;
    const other = accountFromPrivateKey(getBytes(`0x${"11".repeat(32)}`), "localflare");

    /** A C→P export output of `amount` nFLR held by `owners`, `threshold` of them needed. */
    async function exported(amount: bigint, index: number, owners = [account.addressBytes], threshold = 1) {
      const { avaxAssetID } = await replay.env.clients.context();
      return new Utxo(
        new avaxSerial.UTXOID(Id.fromHex(`0x${(index + 1).toString(16).padStart(64, "0")}`), new Int(index % 7)),
        Id.fromString(avaxAssetID),
        new TransferOutput(new BigIntPr(amount), OutputOwners.fromNative(owners, 0n, threshold))
      );
    }

    const many = (count: number, amount: (i: number) => bigint, first = 0) =>
      Promise.all(Array.from({ length: count }, (_, i) => exported(amount(i), first + i)));

    /** The recorded context and fee state, with `utxos` exported from the C-chain. */
    function exportedEnv(utxos: Utxo[]): Env {
      const clients = {
        context: () => replay.env.clients.context(),
        pvm: {
          getFeeState: () => replay.env.clients.pvm.getFeeState(),
          getUTXOs: () => Promise.resolve({ numFetched: utxos.length, utxos, endIndex: { address: "", utxo: "" } }),
        },
      };
      return { network: replay.env.network, clients } as unknown as Env;
    }

    /** Builds importCP; returns its bytes, imported amounts (largest first), gas and notices. */
    async function importCP(env: Env, policy = FILE_SIGNER_POLICY) {
      const context = await env.clients.context();
      const bundle = await buildTransaction({ type: "importCP" }, env, account, policy);
      if (bundle.kind !== "atomic") throw new Error("importCP must be atomic");
      const tx = bundle.unsignedTx.getTx() as pvmSerial.ImportTx;
      return {
        bytes: Buffer.from(bundle.unsignedTx.toBytes()).toString("hex"),
        amounts: tx.ins.map((input) => input.amount()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)),
        gas: pvm.calculateFee(tx, context.platformFeeConfig.weights, 1n),
        notices: bundle.notices ?? [],
      };
    }

    /** The gas one more UTXO adds to an import, measured on two built imports. */
    async function inputGas(): Promise<bigint> {
      const utxos = await many(2, () => ONE_FLR, 900);
      return (await importCP(exportedEnv(utxos))).gas - (await importCP(exportedEnv(utxos.slice(0, 1)))).gas;
    }

    it("skips UTXOs worth less than the fee of importing them at the lowest price, for every signer alike", async () => {
      const symbol = replay.env.network.symbol;
      const { minPrice } = (await replay.env.clients.context()).platformFeeConfig;
      const worthImporting = (await inputGas()) * minPrice;
      const dust = await many(100, () => worthImporting - 1n, 2);
      const coOwned = await exported(50n * ONE_FLR, 200, [account.addressBytes, other.addressBytes], 2);
      const utxos = [...dust, coOwned, await exported(10n * ONE_FLR, 0), await exported(worthImporting, 1)];

      const file = await importCP(exportedEnv(utxos));
      expect(file.amounts, "not the dust, nor the co-owned UTXO flarejs never imported").to.deep.equal([
        10n * ONE_FLR,
        worthImporting,
      ]);
      expect(file.notices).to.deep.equal([
        `100 UTXO(s) (${formatFlr(asNFlr(100n * (worthImporting - 1n)))} ${symbol}) skipped: each is worth less than the fee of importing it, and stays pending`,
      ]);
      const immediate = await importCP(exportedEnv(utxos), IMMEDIATE_SIGNER_POLICY);
      expect(immediate.amounts, "at the chain's price").to.deep.equal(file.amounts);
    });

    it("takes the largest UTXOs the P-chain's gas capacity allows, less a second of refill; the rest stay pending", async () => {
      const symbol = replay.env.network.symbol;
      const { maxCapacity, maxPerSecond } = (await replay.env.clients.context()).platformFeeConfig;
      const limit = maxCapacity - maxPerSecond;
      const utxos = await many(400, (i) => BigInt(i + 1) * ONE_FLR); // 1 to 400 FLR, smallest first
      utxos.push(await exported(1_000n * ONE_FLR, 500, [account.addressBytes, other.addressBytes], 2)); // not counted
      const env = exportedEnv(utxos); // the recorded capacity, a little below the maximum

      const built = await importCP(env);
      const taken = built.amounts.length;
      expect(built.gas <= limit, `gas ${built.gas}`).to.equal(true);
      expect(built.gas + (await inputGas()) > limit, "one more would not fit").to.equal(true);
      expect(built.amounts).to.deep.equal(Array.from({ length: taken }, (_, i) => BigInt(400 - i) * ONE_FLR));
      const left = 400 - taken;
      expect(built.notices).to.deep.equal([
        `${left} UTXO(s) (${formatFlr(asNFlr((BigInt(left * (left + 1)) / 2n) * ONE_FLR))} ${symbol}) stay pending for a later import: the P-chain's gas capacity fits only ${taken} in one`,
      ]);
      expect((await importCP(exportedEnv([...utxos].reverse()))).bytes, "node order").to.equal(built.bytes);
    });

    it("builds an import that leaves nothing out exactly as flarejs builds it from the node's UTXOs, file included", async () => {
      const context = await replay.env.clients.context();
      const utxos = [await exported(ONE_FLR, 0), await exported(2n * ONE_FLR, 1)];
      const built = await buildTransaction({ type: "importCP" }, exportedEnv(utxos), account, FILE_SIGNER_POLICY);
      const direct = pvm.newImportTx(
        {
          feeState: { ...(await replay.env.clients.pvm.getFeeState()), price: FILE_SIGNER_POLICY.feePrice as bigint },
          utxos,
          fromAddressesBytes: [account.addressBytes],
          minIssuanceTime: FILE_SIGNER_POLICY.lockCheckTime as bigint,
          sourceChainId: context.cBlockchainID,
          toAddressesBytes: [account.addressBytes],
        },
        context
      );
      expect(unsignedTxJsonFromBundle(built)).to.deep.equal(unsignedTxJsonFromBundle(atomicBundle("importCP", direct)));
    });

    it("refuses an import whose fee takes all it imports, which the P-chain would take with no output", async () => {
      const context = await replay.env.clients.context();
      // above the dust line, and enough for the fee of an import with no output but not of one with an output
      const value = 4_000_000n;
      const utxos = [await exported(value, 0)];
      const direct = pvm.newImportTx(
        {
          feeState: { ...(await replay.env.clients.pvm.getFeeState()), price: FILE_SIGNER_POLICY.feePrice as bigint },
          utxos,
          fromAddressesBytes: [account.addressBytes],
          minIssuanceTime: FILE_SIGNER_POLICY.lockCheckTime as bigint,
          sourceChainId: context.cBlockchainID,
          toAddressesBytes: [account.addressBytes],
        },
        context
      );
      expect(atomicTxFee(direct, context), "flarejs alone burns all of it").to.equal(value);
      expect(outputAmount(direct, context.avaxAssetID), "with no output").to.equal(undefined);
      await buildTransaction({ type: "importCP" }, exportedEnv(utxos), account, FILE_SIGNER_POLICY).then(
        () => expect.fail("built an import that delivers nothing"),
        (error: unknown) =>
          expect((error as Error).message).to.equal(
            `The fee takes all of the ${formatFlr(asNFlr(value))} ${replay.env.network.symbol} being imported, so ` +
              "nothing would arrive on the P-chain; it is not signed, and the UTXOs stay pending for a later import"
          )
      );
      // a little more pays for the output too
      expect((await importCP(exportedEnv([await exported(4_500_000n, 0)]))).amounts).to.deep.equal([4_500_000n]);
    });

    it("refuses an import of UTXOs that each fit in uint64 but whose sum does not", async () => {
      const utxos = [await exported(TEN_BILLION_FLR, 0), await exported(TEN_BILLION_FLR, 1)];
      await buildTransaction({ type: "importCP" }, exportedEnv(utxos), account, FILE_SIGNER_POLICY).then(
        () => expect.fail("built an import above uint64"),
        (error: unknown) =>
          expect((error as Error).message).to.match(overUint64("The import", replay.env.network.symbol))
      );
    });

    it("refuses an import of nothing but dust, and leaves an empty one to flarejs as before", async () => {
      const symbol = replay.env.network.symbol;
      const refusal = (utxos: Utxo[], message: string) =>
        buildTransaction({ type: "importCP" }, exportedEnv(utxos), account, FILE_SIGNER_POLICY).then(
          () => expect.fail("built an import"),
          (error: unknown) => expect(String(error)).to.include(message)
        );
      await refusal(
        await many(3, () => 1_000n),
        `Nothing worth importing from the C-chain: 3 UTXO(s) (${formatFlr(asNFlr(3_000n))} ${symbol}), each worth less than the fee of importing it`
      );
      await refusal([], "no UTXOs available to import");
    });
  });

  describe("exportCP", () => {
    /** localflare's recorded base fee (1 wei); exportCP-pk passes -f, so its recording has no lookup. */
    const baseFee: Stub = { match: (_path, method) => method === "eth_baseFee", respond: () => "0x1" };

    it("refuses an amount plus fee above uint64, given or estimated, though each fits", () =>
      withReplay(
        "exportCP-pk",
        async (env) => {
          const max = asNFlr(2n ** 64n - 1n);
          const refused = (req: TxRequestOf<"exportCP">) =>
            buildTransaction(req, env, account, IMMEDIATE_SIGNER_POLICY).then(
              () => expect.fail("built an export above uint64"),
              (error: unknown) =>
                expect((error as Error).message).to.match(overUint64("The amount plus the fee", env.network.symbol))
            );
          await refused({ type: "exportCP", amount: max, fee: asNFlr(1n), nonce: 0n });
          await refused({ type: "exportCP", amount: asNFlr(max - 1n), nonce: 0n }); // the estimate is above 1 nFLR
          const fits = { type: "exportCP", amount: asNFlr(max - 1n), fee: asNFlr(1n), nonce: 0n } as const;
          expect((await buildTransaction(fits, env, account, IMMEDIATE_SIGNER_POLICY)).kind).to.equal("atomic");
        },
        [baseFee]
      ));
  });

  describe("transfer", () => {
    // Every recorded transfer pays 1 FLR to one address, so a builder that ignored either would still match them.
    it("pays the amount given to the recipient given, and only the change back to the account", () =>
      withReplay("transfer-pk", async (env) => {
        const recipient = accountFromPrivateKey(getBytes(`0x${"22".repeat(32)}`), "localflare").pAddress;
        const amount = asNFlr(1_234_567_891n);
        const built = await buildTransaction(
          { type: "transfer", amount, to: recipient },
          env,
          account,
          IMMEDIATE_SIGNER_POLICY
        );
        if (built.kind !== "atomic") throw new Error("transfer must be a P-chain transaction");
        const { outputs } = (built.unsignedTx.getTx() as unknown as { baseTx: { outputs: TransferableOutput[] } })
          .baseTx;
        const described = outputs.map((transferable) => {
          const output = transferable.output as TransferOutput;
          return {
            owners: output.getOwners().map((bytes) => `P-${futils.formatBech32("localflare", bytes)}`),
            threshold: output.getThreshold(),
            locktime: output.getLocktime(),
            amount: output.amount(),
          };
        });
        const paid = described.filter((output) => !output.owners.includes(account.pAddress));
        const change = described.filter((output) => output.owners.includes(account.pAddress));
        expect(paid).to.deep.equal([{ owners: [recipient], threshold: 1, locktime: 0n, amount }]);
        for (const output of change) expect(output.owners).to.deep.equal([account.pAddress]);
      }));
  });

  describe("auto-renewed validators", () => {
    // The recorded sessions use the defaults (the account as owner, no auto-compounding), so a builder that dropped
    // either option would still match them. They were recorded for their own account, which the replay needs.
    const recordedAccount = (scenario: string) =>
      accountFromPrivateKey(getBytes(`0x${readGolden(scenario).spec.account!.privateKeyHex}`), "localflare");
    const bech32 = (owners: OutputOwners) =>
      owners.addrs.map((a) => `P-${futils.formatBech32("localflare", a.toBytes())}`);
    const other = accountFromPrivateKey(getBytes(`0x${"22".repeat(32)}`), "localflare").pAddress;

    it("addAutoRenewedValidator puts the owners and auto-compound shares given into the transaction", () =>
      withReplay("addAutoRenewedValidator-pk", async (env) => {
        const signer = recordedAccount("addAutoRenewedValidator-pk");
        // the recorded BLS key and proof of possession: flarejs checks they are points on the curve
        const args = readGolden("addAutoRenewedValidator-pk").spec.args;
        const argOf = (flag: string): string => args[args.indexOf(flag) + 1]!;
        const built = await buildTransaction(
          {
            type: "addAutoRenewedValidator",
            nodeId: "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5",
            amount: asNFlr(10n ** 13n),
            period: 900n,
            delegationFeeShares: 100_000,
            blsPublicKey: getBytes(argOf("--pop-bls-public-key")),
            blsSignature: getBytes(argOf("--pop-bls-signature")),
            ownerAddresses: [other, signer.pAddress],
            autoCompoundShares: 500_000,
          },
          env,
          signer,
          IMMEDIATE_SIGNER_POLICY
        );
        if (built.kind !== "atomic") throw new Error("addAutoRenewedValidator must be a P-chain transaction");
        const tx = built.unsignedTx.getTx() as pvmSerial.AddAutoRenewedValidatorTx;
        // the owners are the validator's authority: they, not the signing key, change its configuration later
        expect(bech32(tx.getValidatorAuthority()).sort()).to.deep.equal([other, signer.pAddress].sort());
        expect(tx.autoCompoundRewardShares.value()).to.equal(500_000);
        expect(tx.delegationShares.value()).to.equal(100_000);
        expect(tx.period.value()).to.equal(900n);
        expect(bech32(tx.getValidatorRewardsOwner())).to.deep.equal([signer.pAddress]);
      }));

    it("setAutoRenewedValidatorConfig puts the auto-compound shares and period given into the transaction", () =>
      withReplay("setAutoRenewedValidatorConfig-pk", async (env) => {
        const built = await buildTransaction(
          {
            type: "setAutoRenewedValidatorConfig",
            nodeId: "NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5",
            period: 604_800n,
            autoCompoundShares: 500_000,
          },
          env,
          recordedAccount("setAutoRenewedValidatorConfig-pk"),
          IMMEDIATE_SIGNER_POLICY
        );
        if (built.kind !== "atomic") throw new Error("setAutoRenewedValidatorConfig must be a P-chain transaction");
        const tx = built.unsignedTx.getTx() as pvmSerial.SetAutoRenewedValidatorConfigTx;
        expect(tx.autoCompoundRewardShares.value()).to.equal(500_000);
        expect(tx.period.value()).to.equal(604_800n);
      }));
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

  describe("P-chain addresses", () => {
    // Every node call fails the build: the addresses are checked before the builder reads the UTXOs.
    const clients = new Proxy(
      {},
      {
        get: (_target, name) => {
          throw new Error(`asked the node for ${String(name)}`);
        },
      }
    );
    const offline = { network: networkConfig("localflare", {}), clients } as unknown as Env;
    // the account's own key on Coston2: the same address bytes, so it used to be paid on localflare
    const costwo = `P-${futils.formatBech32("costwo", account.addressBytes)}`;
    const refusal = `"${costwo}" is an address of costwo, not of this network (localflare): expected P-localflare1…`;
    const refused = (request: Parameters<typeof buildTransaction>[0]) =>
      buildTransaction(request, offline, account, IMMEDIATE_SIGNER_POLICY).then(
        () => expect.fail("built"),
        (error: unknown) => expect(String(error)).to.include(refusal)
      );

    it("transfer refuses a recipient of another network before asking the node", () =>
      refused({ type: "transfer", amount: asNFlr(1n), to: costwo }));

    it("addAutoRenewedValidator refuses an owner of another network before asking the node", () =>
      refused({
        type: "addAutoRenewedValidator",
        nodeId: "NodeID-X",
        amount: asNFlr(1n),
        period: 1n,
        delegationFeeShares: 0,
        blsPublicKey: new Uint8Array(48),
        blsSignature: new Uint8Array(96),
        ownerAddresses: [account.pAddress, costwo],
      }));
  });
});
