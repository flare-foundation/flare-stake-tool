/**
 * `info stakes`: the account's current validations and delegations, read from the
 * P-chain's validator list, with the limit of nodes the network sets.
 */
import { expect } from "chai";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { balancesJson, describeStakes, getStakes, stakesReport, unlistedDelegationsWarning } from "../../src/app/info";
import { asNFlr, asWei } from "../../src/chain/units";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import type { CurrentValidator } from "../../src/chain/validators";
import type { Env } from "../../src/core/types";
import { cleanupTempDir, makeTempDir, runCli, runCliAsync } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const ACCOUNT = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
const OTHER = "P-localflare1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnlplpye";
const owner = (address: string) => ({ locktime: "0", threshold: "1", addresses: [address] });

/** The account validates on A (auto-renewed) and delegates to A and B; someone else delegates to B. */
const VALIDATORS: CurrentValidator[] = [
  {
    txID: "tx-validation-a",
    nodeID: "NodeID-A",
    startTime: "1000",
    endTime: "9000",
    weight: "2000000000000000",
    validationRewardOwner: owner(ACCOUNT.pAddress),
    validatorAuthority: owner(ACCOUNT.pAddress),
    nextPeriod: "1209600",
    delegatorCount: "1",
    delegators: [
      {
        txID: "tx-delegation-a",
        nodeID: "NodeID-A",
        startTime: "1000",
        endTime: "2000",
        stakeAmount: "50000000000000",
        rewardOwner: owner(ACCOUNT.pAddress),
      },
    ],
  },
  {
    txID: "tx-validation-b",
    nodeID: "NodeID-B",
    startTime: "1000",
    endTime: "5000",
    weight: "1000000000000000",
    validationRewardOwner: owner(OTHER),
    delegatorCount: "2",
    delegators: [
      {
        txID: "tx-delegation-b",
        nodeID: "NodeID-B",
        startTime: "1000",
        endTime: "3000",
        // one nFLR above a round amount: a total summed as a float would lose it
        stakeAmount: "15000000000000001",
        rewardOwner: owner(ACCOUNT.pAddress.toUpperCase()),
      },
      {
        txID: "tx-delegation-other",
        nodeID: "NodeID-B",
        startTime: "1000",
        endTime: "3000",
        stakeAmount: "70000000000000",
        rewardOwner: owner(OTHER),
      },
    ],
  },
];

const LINES = [
  `${ACCOUNT.pAddress}: 3 stakes on 2 nodes (at most 3 nodes at once on localflare)`,
  "delegation NodeID-A 50000 LFLR, ends 1970-01-01T00:33:20.000Z (2000), tx tx-delegation-a",
  "delegation NodeID-B 15000000.000000001 LFLR, ends 1970-01-01T00:50:00.000Z (3000), tx tx-delegation-b",
  "validation NodeID-A 2000000 LFLR, auto-renewed, cycle ends 1970-01-01T02:30:00.000Z (9000), tx tx-validation-a",
  "Total staked: 17050000.000000001 LFLR",
];

describe("info stakes", () => {
  it("lists the account's validations and delegations by end time, with their nodes and total", () => {
    const report = stakesReport(VALIDATORS, ACCOUNT.pAddress);
    expect(report.stakes.map((stake) => stake.txId)).to.deep.equal([
      "tx-delegation-a",
      "tx-delegation-b",
      "tx-validation-a",
    ]);
    expect(report.nodes).to.equal(2);
    expect(report.total).to.equal(17_050_000_000_000_001n);
    expect(report.unlisted).to.deep.equal([]);
    expect(describeStakes(report, ACCOUNT.pAddress, networkConfig("localflare", {}))).to.deep.equal(LINES);
  });

  it("names the limit of nodes where the network has one, and says there is none on Songbird and Coston", () => {
    const report = stakesReport(VALIDATORS, ACCOUNT.pAddress);
    for (const [network, limit] of [
      ["flare", "at most 3 nodes at once on flare"],
      ["costwo", "at most 3 nodes at once on costwo"],
      ["songbird", "no limit of nodes on songbird"],
      ["coston", "no limit of nodes on coston"],
    ] as const) {
      expect(describeStakes(report, ACCOUNT.pAddress, networkConfig(network, {}))[0], network).to.equal(
        `${ACCOUNT.pAddress}: 3 stakes on 2 nodes (${limit})`
      );
    }
  });

  it("says when the account has no stake, or one", () => {
    const none = stakesReport(VALIDATORS, "P-localflare1nobody");
    expect(describeStakes(none, "P-localflare1nobody", networkConfig("songbird", {}))).to.deep.equal([
      "P-localflare1nobody: no stakes (no limit of nodes on songbird)",
      "Total staked: 0 SGB",
    ]);
    const one = stakesReport(VALIDATORS, OTHER);
    expect(describeStakes(one, OTHER, networkConfig("flare", {}))[0]).to.equal(
      `${OTHER}: 2 stakes on 1 node (at most 3 nodes at once on flare)`
    );
    const [single] = VALIDATORS;
    expect(
      describeStakes(
        stakesReport([{ ...single!, delegators: [], delegatorCount: "0" }], ACCOUNT.pAddress),
        ACCOUNT.pAddress,
        networkConfig("flare", {})
      )[0]
    ).to.equal(`${ACCOUNT.pAddress}: 1 stake on 1 node (at most 3 nodes at once on flare)`);
  });

  it("lists a stake whose reward owners include the account after another, and names them", () => {
    const shared = { locktime: "0", threshold: "1", addresses: [OTHER, ACCOUNT.pAddress] };
    const report = stakesReport(
      [
        {
          txID: "tx-shared-validation",
          nodeID: "NodeID-C",
          startTime: "1000",
          endTime: "4000",
          weight: "1000000000000000",
          validationRewardOwner: shared,
          delegators: [
            {
              txID: "tx-shared-delegation",
              nodeID: "NodeID-C",
              startTime: "1000",
              endTime: "3500",
              stakeAmount: "50000000000000",
              delegationRewardOwner: shared,
            },
          ],
        },
      ],
      ACCOUNT.pAddress
    );
    expect(describeStakes(report, ACCOUNT.pAddress, networkConfig("flare", {}))).to.deep.equal([
      `${ACCOUNT.pAddress}: 2 stakes on 1 node (at most 3 nodes at once on flare)`,
      `delegation NodeID-C 50000 FLR, ends 1970-01-01T00:58:20.000Z (3500), tx tx-shared-delegation, reward owners ${OTHER}, ${ACCOUNT.pAddress}`,
      `validation NodeID-C 1000000 FLR, ends 1970-01-01T01:06:40.000Z (4000), tx tx-shared-validation, reward owners ${OTHER}, ${ACCOUNT.pAddress}`,
      "Total staked: 1050000 FLR",
    ]);
  });

  it("keeps every wei and nFLR of a balance in its JSON", () => {
    const json = balancesJson(
      { cChainWei: asWei(1_000_000_000_000_000_001n), pChainNFlr: asNFlr(18_446_744_073_709_551_615n) },
      ACCOUNT,
      networkConfig("flare", {})
    );
    expect(json.cChain).to.include({ balance: "1.000000000000000001", wei: "1000000000000000001" });
    expect(json.pChain).to.include({ balance: "18446744073.709551615", nFlr: "18446744073709551615" });
  });

  it("reports a validator whose delegations the node counts but doesn't list in full", () => {
    // the delegators field cut short, or left out altogether
    const { delegators: _left, ...withoutList } = VALIDATORS[0]!;
    const partial: CurrentValidator[] = [
      { ...VALIDATORS[1]!, delegators: VALIDATORS[1]!.delegators!.slice(0, 1) },
      withoutList,
    ];
    const report = stakesReport(partial, ACCOUNT.pAddress);
    expect(report.unlisted).to.deep.equal([
      { nodeId: "NodeID-B", listed: 1, count: "2" },
      { nodeId: "NodeID-A", listed: 0, count: "1" },
    ]);
    expect(unlistedDelegationsWarning(report.unlisted[0]!)).to.equal(
      "The node lists 1 of the 2 delegations to NodeID-B, so some of the account's stakes there may be missing; " +
        "use a node that lists them (--rpc-url)"
    );
    expect(report.stakes.map((stake) => stake.txId)).to.deep.equal(["tx-delegation-b", "tx-validation-a"]);
  });

  it("checks the node's network before reading the validators", async () => {
    const asked: string[] = [];
    const env = {
      network: networkConfig("localflare", {}),
      clients: {
        verifyNetwork: () => (asked.push("network"), Promise.resolve()),
        pvm: { getCurrentValidators: () => (asked.push("validators"), Promise.resolve({ validators: VALIDATORS })) },
      },
    } as unknown as Env;
    expect((await getStakes(env, ACCOUNT)).stakes).to.have.length(3);
    expect(asked).to.deep.equal(["network", "validators"]);
  });

  describe("on the command line", () => {
    const cwd = makeTempDir("info-stakes-test-");
    let server: http.Server;
    let url = "";
    /** What the stand-in node lists as the current validators. */
    let listed: CurrentValidator[] = VALIDATORS;
    before(async () => {
      server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk.toString()));
        req.on("end", () => {
          const { id, method } = JSON.parse(body) as { id: number; method: string };
          const result =
            method === "info.getNetworkID"
              ? { networkID: "162" }
              : method === "platform.getCurrentValidators"
                ? { validators: listed }
                : undefined;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify(
              result === undefined
                ? { jsonrpc: "2.0", id, error: { code: -32601, message: `unexpected ${method}` } }
                : { jsonrpc: "2.0", id, result }
            )
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect(
        runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "localflare"], { cwd }).exitCode
      ).to.equal(0);
    });
    after(() => {
      server.close();
      cleanupTempDir(cwd);
    });

    it("prints the header and the lines on stdout, also as the stakes shortcut", async () => {
      const plain = { NO_COLOR: "1", FORCE_COLOR: "0" };
      const result = await runCliAsync(["info", "stakes", "--rpc-url", url], { cwd, env: plain });
      expect(result.exitCode, result.stderr).to.equal(0);
      expect(result.stdout).to.equal(['Stakes on the network "localflare"', ...LINES].join("\n") + "\n");
      const shortcut = await runCliAsync(["stakes", "--rpc-url", url], { cwd, env: plain });
      expect(shortcut.stdout).to.equal(result.stdout);
    });

    it("prints only the JSON with --json, exact to the nFLR, also as the stakes shortcut", async () => {
      const result = await runCliAsync(["info", "stakes", "--json", "--rpc-url", url], { cwd });
      expect(result.exitCode, result.stderr).to.equal(0);
      expect(JSON.parse(result.stdout)).to.deep.equal({
        network: "localflare",
        symbol: "LFLR",
        pChainAddress: ACCOUNT.pAddress,
        nodeLimit: 3,
        nodes: 2,
        total: "17050000.000000001",
        totalNFlr: "17050000000000001",
        stakes: [
          {
            kind: "delegation",
            nodeId: "NodeID-A",
            amount: "50000",
            amountNFlr: "50000000000000",
            startTime: 1000,
            endTime: 2000,
            autoRenewed: false,
            txId: "tx-delegation-a",
            rewardOwners: [ACCOUNT.pAddress],
          },
          {
            kind: "delegation",
            nodeId: "NodeID-B",
            amount: "15000000.000000001",
            amountNFlr: "15000000000000001",
            startTime: 1000,
            endTime: 3000,
            autoRenewed: false,
            txId: "tx-delegation-b",
            rewardOwners: [ACCOUNT.pAddress.toUpperCase()],
          },
          {
            kind: "validation",
            nodeId: "NodeID-A",
            amount: "2000000",
            amountNFlr: "2000000000000000",
            startTime: 1000,
            endTime: 9000,
            autoRenewed: true,
            txId: "tx-validation-a",
            rewardOwners: [ACCOUNT.pAddress],
          },
        ],
      });
      const shortcut = await runCliAsync(["stakes", "--json", "--rpc-url", url], { cwd });
      expect(shortcut.stdout).to.equal(result.stdout);
    });

    it("warns on stderr about a validator whose delegations the node doesn't list in full, and still lists the rest", async () => {
      listed = [{ ...VALIDATORS[1]!, delegators: VALIDATORS[1]!.delegators!.slice(1) }, VALIDATORS[0]!];
      try {
        const result = await runCliAsync(["info", "stakes", "--rpc-url", url], {
          cwd,
          env: { NO_COLOR: "1", FORCE_COLOR: "0" },
        });
        expect(result.exitCode, result.stderr).to.equal(0);
        expect(result.stderr).to.include(
          "The node lists 1 of the 2 delegations to NodeID-B, so some of the account's stakes there may be missing; " +
            "use a node that lists them (--rpc-url)"
        );
        expect(result.stdout).to.not.include("The node lists");
        expect(result.stdout).to.include(`${ACCOUNT.pAddress}: 2 stakes on 1 node`);
        // with --json the warning stays on stderr, and stdout is nothing but the JSON
        const json = await runCliAsync(["info", "stakes", "--json", "--rpc-url", url], { cwd });
        expect(json.stderr).to.include("The node lists 1 of the 2 delegations to NodeID-B");
        expect((JSON.parse(json.stdout) as { nodes: number }).nodes).to.equal(1);
      } finally {
        listed = VALIDATORS;
      }
    });
  });
});
