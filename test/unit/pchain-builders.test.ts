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
  pvm,
  pvmSerial,
  utils as futils,
} from "@flarenetwork/flarejs";
import { expect } from "chai";
import { getBytes } from "ethers";
import { accountFromPrivateKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { asNFlr } from "../../src/chain/units";
import { buildTransaction } from "../../src/core/builders";
import { UTXO_PAGE_SIZE, allUtxos, maxExportPCAmount, spendableAmount } from "../../src/core/builders/pchain";
import { atomicTxFee } from "../../src/core/fee";
import { FILE_SIGNER_POLICY, IMMEDIATE_SIGNER_POLICY, type Env } from "../../src/core/types";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { startReplay, withReplay, type Replay, type ReplayEnv } from "../helpers/replay";

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

    it("leaves out a UTXO worth less than the fee of adding it; it stays on the P-chain with the change", async () => {
      const big = await owned(100_000_000_000n, 0); // 100 FLR
      const dust = await owned(200_000n, 1); // 0.0002 FLR
      for (const policy of POLICIES) {
        const built = await exportAll([big, dust], policy);
        const label = `@${policy.feePrice}`;
        expect(built.spent, `${label}: only the 100 FLR UTXO`).to.deep.equal([big.utxoId.txID.toString()]);
        expect(built.fee, label).to.equal(built.required);
        expect(built.change, `${label}: one change output`).to.have.length(1);
        expect(built.exported[0]! + built.fee + built.change[0]!, label).to.equal(100_000_000_000n);
      }
    });

    it("builds when spending every UTXO would exceed the gas capacity but the export does not", async () => {
      const big = await owned(100_000_000_000n, 0); // 100 FLR
      const dust = await Promise.all(Array.from({ length: 400 }, (_, i) => owned(1n, i + 1))); // 400 × 1 nFLR
      for (const policy of POLICIES) {
        const built = await exportAll([big, ...dust], policy, 1_000_000n);
        const label = `@${policy.feePrice}`;
        expect(built.spent, `${label}: only the 100 FLR UTXO`).to.deep.equal([big.utxoId.txID.toString()]);
        expect(built.fee, label).to.equal(built.required);
        expect(built.exported[0]! + built.fee + built.change[0]!, label).to.equal(100_000_000_000n);
      }
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
      const clients = {
        context: () => replay.env.clients.context(),
        evm: {
          getUTXOs: () =>
            Promise.resolve({ numFetched: utxos.length, utxos, endIndex: { address: "", utxo: "" }, encoding: "hex" }),
          getBaseFee: () => Promise.resolve(25_000_000_000n),
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
