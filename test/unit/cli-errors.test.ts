/**
 * Failure modes of the built CLI that need no node: every error must end with
 * exit code 1 so scripts notice, and nothing secret may reach the output.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { cleanupTempDir, makeTempDir, runCli } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

/** Nothing listens here, so a command that gets as far as the node fails fast. */
const CLOSED_NODE = "http://127.0.0.1:1";

describe("CLI errors (built CLI, no node)", function () {
  this.timeout(30_000);
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir("cli-errors-");
  });

  afterEach(() => {
    cleanupTempDir(cwd);
  });

  it("init-ctx with an invalid public key exits 1 and writes no context file", () => {
    const result = runCli(["init-ctx", "-p", "zz", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Invalid public key");
    expect(fs.existsSync(path.join(cwd, "ctx.json"))).to.equal(false);
  });

  it("info with an unknown type exits 1 before looking for a context file", () => {
    const result = runCli(["info", "foo", "--network", "costwo"], { cwd });
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include('Unknown information type "foo"; use addresses, balance, validators');
  });

  it("an invalid --rpc-url is reported without the API key it carries", () => {
    const result = runCli(
      ["info", "validators", "--network", "costwo", "--rpc-url", "ftp://host/ext/info?x-apikey=SECRET-KEY"],
      { cwd }
    );
    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include("Invalid node URL");
    expect(result.stderr + result.stdout).to.not.include("SECRET-KEY");
  });

  it("warns on stderr about an end time in the past, such as 14 days given as plain seconds", () => {
    expect(runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "costwo"], { cwd }).exitCode).to.equal(0);
    const result = runCli(
      ["delegate", "-n", "NodeID-x", "-a", "1", "-e", "1209600", "-i", "t1", "--network", "costwo"],
      { cwd, env: { FLARE_RPC_URL: CLOSED_NODE } }
    );
    expect(result.stderr).to.include("Warning: End time 1209600 (1970-01-15T00:00:00.000Z) is not in the future");
    expect(result.stdout).to.not.include("Warning");
    expect(result.exitCode).to.equal(1); // the closed node, not the warning, ends the command
  });
});
