import { expect } from "chai";
import { isAutoRenewed, stakesOf, type CurrentValidator } from "../../src/chain/validators";
import { checkNodeLimit } from "../../src/app/transactions";
import { accountFromPublicKey } from "../../src/chain/keys";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const owner = (addresses: string[]) => ({ locktime: "0", threshold: "1", addresses });
const target = "P-flare1a0urfpade4npyq5qvlcsscfzsqtqhg88ka57cy";
const other = "P-flare1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

const validators: CurrentValidator[] = [
  {
    txID: "val-1",
    nodeID: "NodeID-A",
    startTime: "1000",
    endTime: "9000",
    weight: "10000000000000",
    validationRewardOwner: owner([target]),
    delegators: [
      {
        txID: "del-1",
        nodeID: "NodeID-A",
        startTime: "2000",
        endTime: "3000",
        weight: "2000000000000",
        rewardOwner: owner([target]),
      },
      {
        txID: "del-2",
        nodeID: "NodeID-A",
        startTime: "2000",
        endTime: "3000",
        stakeAmount: "5",
        delegationRewardOwner: owner([other]),
      },
    ],
  },
  {
    txID: "val-2",
    nodeID: "NodeID-B",
    startTime: "1000",
    endTime: "9000",
    stakeAmount: "7",
    rewardOwner: owner([target.toUpperCase()]),
    validatorAuthority: owner([target]),
    nextPeriod: "900",
    autoCompoundRewardShares: "0",
  },
];

describe("chain/validators", () => {
  it("collects validations and delegations by reward owner, from weight or stakeAmount", () => {
    const stakes = stakesOf(validators, target);
    expect(stakes.map((s) => [s.txId, s.kind, s.nodeId, s.amount])).to.deep.equal([
      ["val-1", "validator", "NodeID-A", 10_000_000_000_000n],
      ["del-1", "delegator", "NodeID-A", 2_000_000_000_000n],
      ["val-2", "validator", "NodeID-B", 7n],
    ]);
    expect(stakesOf(validators, other).map((s) => s.txId)).to.deep.equal(["del-2"]);
  });

  it("recognises auto-renewed validators by the Helicon fields", () => {
    expect(isAutoRenewed(validators[0]!)).to.equal(false);
    expect(isAutoRenewed(validators[1]!)).to.equal(true);
  });

  it("refuses a fourth distinct node only while three others overlap", () => {
    const account = { ...accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "flare"), pAddress: target };
    const three: CurrentValidator[] = ["NodeID-A", "NodeID-B", "NodeID-C"].map((nodeID) => ({
      txID: nodeID,
      nodeID,
      startTime: "1000",
      endTime: "9000",
      weight: "1",
      validationRewardOwner: owner([target]),
    }));
    // (account, node, end time, now)
    expect(() => checkNodeLimit(three, account, "NodeID-D", 3000n, 2000n)).to.throw(
      /already has active stakes to 3 different nodes/
    );
    expect(() => checkNodeLimit(three, account, "NodeID-A", 3000n, 2000n)).to.not.throw();
    expect(() => checkNodeLimit(three, account, "NodeID-D", 9500n, 9001n)).to.not.throw(); // after they end
    expect(() => checkNodeLimit(three.slice(0, 2), account, "NodeID-D", 3000n, 2000n)).to.not.throw();
  });

  it("counts the period from now, since the chain starts a stake when it accepts it (a later --start-time is not used)", () => {
    const account = { ...accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "flare"), pAddress: target };
    const three: CurrentValidator[] = ["NodeID-A", "NodeID-B", "NodeID-C"].map((nodeID) => ({
      txID: nodeID,
      nodeID,
      startTime: "1000",
      endTime: "9000",
      weight: "1",
      validationRewardOwner: owner([target]),
    }));
    // A fourth node until 20000, asked for at 2000 with a start time after 9000: the stake would start at 2000.
    expect(() => checkNodeLimit(three, account, "NodeID-D", 20_000n, 2000n)).to.throw(
      /already has active stakes to 3 different nodes/
    );
  });
});
