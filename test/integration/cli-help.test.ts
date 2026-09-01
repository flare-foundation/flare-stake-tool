import { expect } from "chai";
import { runCli } from "./cli-helper";

describe("CLI smoke tests (no network)", () => {
  it("--help exits 0 and shows commands", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).to.equal(0);
    expect(result.stdout).to.include("Usage:");
    expect(result.stdout).to.include("Commands:");
    expect(result.stdout).to.include("init-ctx");
    expect(result.stdout).to.include("transaction");
    expect(result.stdout).to.include("info");
    expect(result.stdout).to.include("send");
  });

  const subcommands = [
    "init-ctx",
    "transaction",
    "info",
    "send",
    "forDefi",
    "withdrawal",
    "claim",
    "setClaimExecutors",
    "setAllowedClaimRecipients",
    "customCChainTx",
  ];

  for (const cmd of subcommands) {
    it(`${cmd} --help exits 0`, () => {
      const result = runCli([cmd, "--help"]);
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout).to.include("Usage:");
    });
  }

  it("rejects unknown command with non-zero exit", () => {
    const result = runCli(["nonsense-command"]);
    expect(result.exitCode).to.not.equal(0);
  });
});
