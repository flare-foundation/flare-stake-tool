/**
 * The checks that refuse a P-chain request before anything is built or signed:
 * a delegation to an unknown node or past the validator's period, Helicon
 * requests on a network without Helicon, the limit of three nodes per account,
 * and the validator an auto-renew config change targets.
 */
import { expect } from "chai";
import { checkNodeLimit, runTransaction } from "../../src/app/transactions";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { resolveAutoRenewedValidator } from "../../src/core/builders/pchain";
import { asNFlr, asWei } from "../../src/chain/units";
import { resolveEvmFees } from "../../src/constants/fees";
import type { Env, TxRequest } from "../../src/core/types";
import { ExternalFileSigner } from "../../src/signers/file";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

/** Where the file signer would write, should a request get past the checks: not the repository's ForDefiTxnFiles. */
const SIGNER_DIR = makeTempDir("preflight-test-");
after(() => cleanupTempDir(SIGNER_DIR));

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
  runTransaction(req, env, new ExternalFileSigner(ACCOUNT, "t", SIGNER_DIR)).then(
    () => expect.fail(`${req.type} passed the checks`),
    (error: unknown) => String(error)
  );

describe("the node's network, checked before any request is built", () => {
  // the C-chain builders never fetch the Context, so this check is their only refusal of a node on another network
  it("refuses a node on another network for every C-chain command and atomic type, before the node is asked more", async () => {
    const mismatch = "The node at http://node is on network ID 14 (flare), not localflare (162)";
    const env = {
      network: networkConfig("localflare", {}),
      clients: { verifyNetwork: () => Promise.reject(new Error(mismatch)) },
    } as unknown as Env;
    const TO = "0x3333333333333333333333333333333333333333";
    const fees = resolveEvmFees("withdrawal");
    const requests: TxRequest[] = [
      { type: "withdrawal", to: TO, amount: asWei(1n), fees },
      { type: "claim", recipient: TO, wrap: false, fees },
      { type: "setClaimExecutors", executors: [TO], fees },
      { type: "setAllowedClaimRecipients", recipients: [TO], fees },
      { type: "customCChainTx", to: TO, value: asWei(0n), data: "0x", fees },
      { type: "exportCP", amount: asNFlr(1n), fee: asNFlr(1n) },
      { type: "importCP" },
    ];
    for (const req of requests) {
      expect(await refusalOf(req, env), req.type).to.equal(`Error: ${mismatch}`);
    }
  });
});

describe("checks before a P-chain request is built", () => {
  // the fixtures' stakes end at PERIOD_END, and the checks compare them with the clock: it is set to a time they run,
  // whatever the date (with the real clock, the three-node limit had no stakes to count from 2027-01-16)
  const realNow = Date.now;
  beforeEach(() => {
    Date.now = () => (PERIOD_END - 60 * 86_400) * 1000;
  });
  afterEach(() => {
    Date.now = realNow;
  });

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

    it("counts a stake ending now and one starting at the request's end, and lets a delegation end with the validator", async () => {
      const now = 1_750_000_000n;
      const stake = (nodeID: string, startTime: bigint, endTime: bigint) => ({
        ...validator(nodeID, `tx-${nodeID}`),
        startTime: String(startTime),
        endTime: String(endTime),
        delegators: [{ ...delegation(nodeID), startTime: String(startTime), endTime: String(endTime) }],
      });
      const end = now + 86_400n;
      const validators = [
        stake("NodeID-One", now - 86_400n, now), // ends this second: still active
        stake("NodeID-Two", end, end + 86_400n), // starts at the request's end: overlaps it
        stake("NodeID-Three", now - 86_400n, end + 86_400n),
      ] as unknown as Parameters<typeof checkNodeLimit>[0];
      expect(() => checkNodeLimit(validators, ACCOUNT, "NodeID-Fourth", end, now)).to.throw(LIMIT);
      expect(
        () => checkNodeLimit(validators, ACCOUNT, "NodeID-Fourth", end, now + 1n),
        "a second later"
      ).not.to.throw();
      expect(
        () => checkNodeLimit(validators, ACCOUNT, "NodeID-Fourth", end - 1n, now),
        "ends a second earlier"
      ).not.to.throw();
      // a delegation may end exactly when the validator's period does
      const atEnd: TxRequest = {
        type: "delegate",
        nodeId: "NodeID-Plain",
        amount: asNFlr(10n ** 12n),
        endTime: BigInt(PERIOD_END),
      };
      expect(await refusalOf(atEnd, node())).to.include("env.clients.context is not a function");
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
