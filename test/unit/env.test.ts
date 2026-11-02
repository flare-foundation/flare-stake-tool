import { expect } from "chai";
import fs from "fs";
import path from "path";
import { backupContextFile, readContextFile, writeContextFile, type ContextFile } from "../../src/app/env";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const FORDEFI_CONTEXT: ContextFile = {
  wallet: "publicKey",
  publicKey: EWOQ_PUBLIC_KEY_COMPRESSED,
  network: "costwo",
  vaultId: "vault-123",
};

describe("app/env context file", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = makeTempDir("env-");
    file = path.join(dir, "ctx.json");
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it("moves the context aside as a timestamped backup instead of deleting it", () => {
    writeContextFile(FORDEFI_CONTEXT, file);
    const backup = backupContextFile(file, new Date("2026-11-02T12:34:56.789Z"));
    expect(backup).to.equal(`${file}.2026-11-02T12-34-56-789Z.bak`);
    expect(fs.existsSync(file)).to.equal(false);
    expect(readContextFile(backup)).to.deep.equal(FORDEFI_CONTEXT); // vault id and all
  });

  it("never overwrites an earlier backup", () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    writeContextFile(FORDEFI_CONTEXT, file);
    backupContextFile(file, now);
    writeContextFile({ ...FORDEFI_CONTEXT, vaultId: "vault-456" }, file);
    expect(() => backupContextFile(file, now)).to.throw(/already exists/);
    expect(readContextFile(file).vaultId).to.equal("vault-456");
  });
});
