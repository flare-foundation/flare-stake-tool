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
  TransferableOutput,
  Utxo,
  avaxSerial,
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
