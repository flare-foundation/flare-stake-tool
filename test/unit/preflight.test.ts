/**
 * The checks that refuse a P-chain request before anything is built or signed:
 * a delegation to an unknown node or past the validator's period, Helicon
 * requests on a network without Helicon, the limit of three nodes per account,
 * and the validator an auto-renew config change targets.
 */
import { expect } from "chai";
import { runTransaction } from "../../src/app/transactions";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { resolveAutoRenewedValidator } from "../../src/core/builders/pchain";
import { asNFlr } from "../../src/chain/units";
import type { Env, TxRequest } from "../../src/core/types";
import { ExternalFileSigner } from "../../src/signers/file";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const ACCOUNT = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
const OTHER = "P-localflare1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnlplpye";
const PERIOD_END = 1_800_086_400;

const validator = (nodeID: string, txID: string, authority?: string[]) => ({
  txID,
  nodeID,
  startTime: "1700000000",
  endTime: String(PERIOD_END),
  weight: "10000000000000",
  delegators: [],
  ...(authority ? { validatorAuthority: { locktime: "0", threshold: 1, addresses: authority } } : {}),
});

const VALIDATORS = [
  validator("NodeID-Plain", "tx-plain"),
  validator("NodeID-Foreign", "tx-foreign", [OTHER]),
  validator("NodeID-Ours", "tx-ours", [OTHER, ACCOUNT.pAddress.toUpperCase()]),
];

/**
 * A node that answers only what the checks ask (the current validators and
 * whether Helicon is active); a request that passed them would fail on the
 * first other call.
 */
function node(helicon = true, validators: object[] = VALIDATORS): Env {
  const clients = {
    verifyNetwork: () => Promise.resolve(),
    isHeliconActive: () => Promise.resolve(helicon),
    pvm: { getCurrentValidators: () => Promise.resolve({ validators }) },
  };
  return { network: networkConfig("localflare", {}), clients } as unknown as Env;
}

const refusalOf = (req: TxRequest, env: Env): Promise<string> =>
  runTransaction(req, env, new ExternalFileSigner(ACCOUNT, "t")).then(
    () => expect.fail(`${req.type} passed the checks`),
    (error: unknown) => String(error)
  );

describe("checks before a P-chain request is built", () => {
  it("refuses a delegation to a node that is not a current validator", async () => {
    const req: TxRequest = {
      type: "delegate",
      nodeId: "NodeID-Unknown",
      amount: asNFlr(10n ** 12n),
      endTime: 1_799_000_000n,
    };
    expect(await refusalOf(req, node())).to.include("Unknown node id");
  });

  it("refuses a delegation that ends after the validator's current period", async () => {
    const req: TxRequest = {
      type: "delegate",
      nodeId: "NodeID-Plain",
      amount: asNFlr(10n ** 12n),
      endTime: BigInt(PERIOD_END + 1),
    };
    expect(await refusalOf(req, node())).to.include(
      `End time must be within the validator's current period, which ends at ${PERIOD_END} (${new Date(PERIOD_END * 1000).toISOString()})`
    );
  });

  it("refuses auto-renewed validator requests where Helicon is not active", async () => {
    const requests: TxRequest[] = [
      {
        type: "addAutoRenewedValidator",
        nodeId: "NodeID-New",
        amount: asNFlr(10n ** 13n),
        period: 1_209_600n,
        delegationFeeShares: 200_000,
        blsPublicKey: new Uint8Array(48),
        blsSignature: new Uint8Array(96),
      },
      { type: "setAutoRenewedValidatorConfig", nodeId: "NodeID-Ours", period: 0n },
    ];
    for (const req of requests) {
      expect(await refusalOf(req, node(false)), req.type).to.include(
        "Auto-renewed validators (Helicon upgrade) are not active on"
      );
    }
  });

  describe("the validator of an auto-renew config change", () => {
    it("is found by node id or validation tx id, with the account's index in its authority", async () => {
      const expected = { validatorTxId: "tx-ours", authIndex: 1, nodeId: "NodeID-Ours" };
      expect(await resolveAutoRenewedValidator({ nodeId: "NodeID-Ours" }, node(), ACCOUNT)).to.deep.equal(expected);
      expect(await resolveAutoRenewedValidator({ validatorTxId: "tx-ours" }, node(), ACCOUNT)).to.deep.equal(expected);
    });

    it("must be a current validator", async () => {
      for (const [req, name] of [
        [{ nodeId: "NodeID-Unknown" }, "NodeID-Unknown"],
        [{ validatorTxId: "tx-unknown" }, "tx-unknown"],
      ] as const) {
        await resolveAutoRenewedValidator(req, node(), ACCOUNT).then(
          () => expect.fail(`found ${name}`),
          (error: unknown) => expect(String(error)).to.include(`No current validator ${name} on the network`)
        );
      }
    });

    it("must be auto-renewed, with the account in its authority", async () => {
      await resolveAutoRenewedValidator({ nodeId: "NodeID-Plain" }, node(), ACCOUNT).then(
        () => expect.fail("accepted a validator without authority"),
        (error: unknown) => expect(String(error)).to.include("Validator NodeID-Plain is not an auto-renewed validator")
      );
      await resolveAutoRenewedValidator({ nodeId: "NodeID-Foreign" }, node(), ACCOUNT).then(
        () => expect.fail("accepted an authority without the account"),
        (error: unknown) =>
          expect(String(error)).to.include(
            `The configured account ${ACCOUNT.pAddress} is not in the validator authority of NodeID-Foreign (${OTHER})`
          )
      );
    });
  });

  describe("the limit of three nodes per account", () => {
    const delegation = (nodeID: string) => ({
      txID: `delegation-${nodeID}`,
      nodeID,
      startTime: "1700000000",
      endTime: String(PERIOD_END),
      stakeAmount: "50000000000000",
      rewardOwner: { locktime: "0", threshold: "1", addresses: [ACCOUNT.pAddress] },
    });
    const delegatedTo = (nodeID: string) => ({
      ...validator(nodeID, `tx-${nodeID}`),
      delegators: [delegation(nodeID)],
    });
    // the account delegates to three nodes until PERIOD_END; NodeID-Fourth is a validator it has no stake with
    const STAKED = [
      delegatedTo("NodeID-One"),
      delegatedTo("NodeID-Two"),
      delegatedTo("NodeID-Three"),
      validator("NodeID-Fourth", "tx-fourth"),
    ];
    const LIMIT = "In the selected time period the account already has active stakes to 3 different nodes";
    const endTime = BigInt(PERIOD_END - 86_400);
    const bls = { blsPublicKey: new Uint8Array(48), blsSignature: new Uint8Array(96) };

    it("refuses a stake, a delegation or an auto-renewed validator on a fourth node, on every path", async () => {
      const requests: TxRequest[] = [
        {
          type: "stake",
          nodeId: "NodeID-New",
          amount: asNFlr(10n ** 13n),
          endTime,
          delegationFeeShares: 200_000,
          ...bls,
        },
        { type: "delegate", nodeId: "NodeID-Fourth", amount: asNFlr(10n ** 12n), endTime },
        // no end: it overlaps every stake that has not ended
        {
          type: "addAutoRenewedValidator",
          nodeId: "NodeID-New",
          amount: asNFlr(10n ** 13n),
          period: 1_209_600n,
          delegationFeeShares: 200_000,
          ...bls,
        },
      ];
      for (const req of requests) {
        expect(await refusalOf(req, node(true, STAKED)), req.type).to.include(LIMIT);
      }
    });

    it("lets a request on one of the three nodes past it", async () => {
      const requests: TxRequest[] = [
        { type: "delegate", nodeId: "NodeID-Two", amount: asNFlr(10n ** 12n), endTime },
        {
          type: "stake",
          nodeId: "NodeID-Three",
          amount: asNFlr(10n ** 13n),
          endTime,
          delegationFeeShares: 200_000,
          ...bls,
        },
      ];
      for (const req of requests) {
        // the fake node has no chain context, so a request past every check fails when the builder asks for it
        expect(await refusalOf(req, node(true, STAKED)), req.type).to.include("env.clients.context is not a function");
      }
    });
  });
});
