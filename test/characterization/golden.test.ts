import { expect } from "chai";
import { keccak256 } from "ethers";
import fs from "fs";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { RpcReplayServer } from "./rpc-replay";
import { evmContractStubs } from "./evm-stubs";
import { localflareNetworkIdStub } from "./node-stubs";
import { comparableOutcome, fixturePath, goldenPath, listGoldens, readGolden, runScenario } from "./scenarios";

/** UPDATE_GOLDENS=name1,name2 (or "all") rewrites those goldens from the current code. */
function updateRequested(name: string): boolean {
  const requested = (process.env["UPDATE_GOLDENS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return requested.includes("all") || requested.includes(name);
}

/**
 * Characterization tests: every golden in test/golden is replayed against its
 * recorded RPC fixture and must reproduce the same unsigned bytes, signatures,
 * submitted transactions and ids. A difference is a behaviour change: either a
 * bug, or an intentional change that must update the golden together with
 * CHANGELOG.md and docs/COMMANDS.md.
 */
describe("characterization goldens (offline replay)", function () {
  this.timeout(120_000);

  const goldens = listGoldens();
  if (goldens.length === 0) {
    it("has recorded goldens (run `pnpm test:record-fixtures` against a localflare node)", function () {
      this.skip();
    });
  }

  for (const name of goldens) {
    it(name, async () => {
      const golden = readGolden(name);
      if (!fs.existsSync(fixturePath(name))) {
        throw new Error(`fixture for ${name} is missing`);
      }
      const server = await RpcReplayServer.start({
        mode: "replay",
        fixturePath: fixturePath(name),
        stubs: [...evmContractStubs, localflareNetworkIdStub],
      });
      const cwd = makeTempDir(`golden-${name}-`);
      try {
        const outcome = await runScenario(golden.spec, {
          cwd,
          rpcUrl: server.url,
          unsignedFor: (producer) => readGolden(producer).outcome.unsignedTxJson,
          submissions: () => server.submissions,
        });
        expect(server.misses, "RPC calls without a recorded response").to.deep.equal([]);
        // The replay answers eth_sendRawTransaction with the recorded hash whatever was sent, so check that the
        // signed bytes really hash to the id the command reported (a golden rewritten for new bytes keeps the old one).
        for (const submission of outcome.submissions.filter((s) => s.method === "eth_sendRawTransaction")) {
          const [raw] = submission.params as [string];
          expect(outcome.txIds, "the reported id is the hash of the submitted bytes").to.include(keccak256(raw));
        }
        if (updateRequested(name)) {
          // Intentional behaviour change: re-capture the outcome against the recorded fixture.
          expect(outcome.exitCode, `stderr: ${outcome.stderr}\nstdout: ${outcome.stdout}`).to.equal(0);
          fs.writeFileSync(goldenPath(name), JSON.stringify({ spec: golden.spec, outcome }, null, 2) + "\n");
          return;
        }
        expect(outcome.exitCode, `stderr: ${outcome.stderr}\nstdout: ${outcome.stdout}`).to.equal(
          golden.outcome.exitCode
        );
        expect(comparableOutcome(outcome)).to.deep.equal(comparableOutcome(golden.outcome));
      } finally {
        await server.close();
        cleanupTempDir(cwd);
      }
    });
  }
});
