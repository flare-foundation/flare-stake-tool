import { expect } from "chai";
import { keccak256 } from "ethers";
import fs from "fs";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { RpcReplayServer } from "./rpc-replay";
import { evmContractStubs } from "./evm-stubs";
import { localflareNetworkIdStub } from "./node-stubs";
import {
  comparableOutcome,
  fixturePath,
  goldenPath,
  listGoldens,
  readGolden,
  runScenario,
  updateRequested,
  type ScenarioOutcome,
  type ScenarioSpec,
} from "./scenarios";

/**
 * Characterization tests: every golden in test/golden is replayed against its
 * recorded RPC fixture and must reproduce the same unsigned bytes, signatures,
 * submitted transactions and ids, and print the same stdout and stderr. A
 * difference is a behaviour change: either a bug, or an intentional change that
 * must update the golden together with CHANGELOG.md and docs/COMMANDS.md.
 */
describe("characterization goldens (offline replay)", function () {
  this.timeout(120_000);

  const goldens = listGoldens();
  if (goldens.length === 0) {
    it("has recorded goldens (run `pnpm test:record-fixtures` against a localflare node)", function () {
      this.skip();
    });
  }

  /** Runs `spec` against the recorded session of golden `name` and checks what the replay alone can check. */
  async function replay(name: string, spec: ScenarioSpec): Promise<ScenarioOutcome> {
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
      const outcome = await runScenario(spec, {
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
      return outcome;
    } finally {
      await server.close();
      cleanupTempDir(cwd);
    }
  }

  for (const name of goldens) {
    it(name, async () => {
      const golden = readGolden(name);
      const outcome = await replay(name, golden.spec);
      if (updateRequested(name)) {
        // Intentional behaviour change: re-capture the outcome against the recorded fixture.
        expect(outcome.exitCode, `stderr: ${outcome.stderr}\nstdout: ${outcome.stdout}`).to.equal(0);
        // The replay does not produce the reference data of the legacy Ledger recording, which is kept.
        const { ledger } = golden.outcome as { ledger?: unknown };
        const updated = { ...outcome, ...(ledger === undefined ? {} : { ledger }) };
        fs.writeFileSync(goldenPath(name), JSON.stringify({ spec: golden.spec, outcome: updated }, null, 2) + "\n");
        return;
      }
      expect(outcome.exitCode, `stderr: ${outcome.stderr}\nstdout: ${outcome.stdout}`).to.equal(
        golden.outcome.exitCode
      );
      expect(comparableOutcome(outcome)).to.deep.equal(comparableOutcome(golden.outcome));
    });
  }

  // src/run.ts turns `balance` and `validators` into `info balance` and `info validators`: the shortcut must
  // produce exactly what the recorded `info` command does.
  for (const name of ["info-balance-pk", "info-validators-pk"]) {
    it(`${name}, through its shortcut`, async () => {
      const golden = readGolden(name);
      const [command, ...shortcutArgs] = golden.spec.args;
      expect(command).to.equal("info");
      const outcome = await replay(name, { ...golden.spec, args: shortcutArgs });
      expect(comparableOutcome(outcome)).to.deep.equal(comparableOutcome(golden.outcome));
    });
  }
});
