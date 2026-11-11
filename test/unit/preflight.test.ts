/**
 * The checks that refuse a P-chain request before anything is built or signed:
 * a delegation to an unknown node or past the validator's period, Helicon
 * requests on a network without Helicon, and the validator an auto-renew
 * config change targets.
 */
import { expect } from "chai";
import { runTransaction } from "../../src/app/transactions";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { resolveAutoRenewedValidator } from "../../src/core/builders/pchain";
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
function node(helicon = true): Env {
  const clients = {
    verifyNetwork: () => Promise.resolve(),
    isHeliconActive: () => Promise.resolve(helicon),
    pvm: { getCurrentValidators: () => Promise.resolve({ validators: VALIDATORS }) },
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
    const req: TxRequest = { type: "delegate", nodeId: "NodeID-Unknown", amount: 10n ** 12n, endTime: 1_799_000_000n };
    expect(await refusalOf(req, node())).to.include("Unknown node id");
  });

  it("refuses a delegation that ends after the validator's current period", async () => {
    const req: TxRequest = {
      type: "delegate",
      nodeId: "NodeID-Plain",
      amount: 10n ** 12n,
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
        amount: 10n ** 13n,
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
});
