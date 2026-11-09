import { expect } from "chai";
import fs from "fs";
import path from "path";
import {
  backupContextFile,
  createEnv,
  readContextFile,
  resolveNetworkName,
  writeContextFile,
  type ContextFile,
} from "../../src/app/env";
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

  it("loads minimal and older contexts as written, cached addresses and unknown fields included", () => {
    for (const context of [
      { publicKey: EWOQ_PUBLIC_KEY_COMPRESSED, network: "costwo" },
      {
        // an older Ledger context: a C-chain address in flareAddress, and a field this version does not know
        wallet: "ledger",
        publicKey: `0x${EWOQ_PUBLIC_KEY_COMPRESSED}`,
        network: "flare",
        ethAddress: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC",
        flareAddress: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC",
        derivationPath: "m/44'/60'/0'/0/0",
        createdBy: "v3",
      },
    ]) {
      fs.writeFileSync(file, JSON.stringify(context));
      expect(readContextFile(file)).to.deep.equal(context);
    }
  });

  it("refuses a context file that is not JSON, not an object, or has a field it reads of the wrong type", () => {
    for (const [content, refusal] of [
      ["{", `Context file ${file} is not valid JSON (`],
      // a raw key file given as the context: none of its characters are quoted
      ["d133724945abcdef", `Context file ${file} is not valid JSON (Unexpected token 'd' in JSON)`],
      ["null", `Context file ${file} is not a JSON object`],
      ["[]", `Context file ${file} is not a JSON object`],
      ['{"publicKey":"02aa"}', `Context file ${file} is missing publicKey or network`],
      [
        '{"publicKey":"02aa","network":"costwo","derivationPath":5}',
        `Context file ${file} has a derivationPath that is not a string`,
      ],
      [
        `{"publicKey":"02aa","network":"costwo","derivationPath":"m/44'/60'/0'/0/1O"}`,
        `Invalid derivation path "m/44'/60'/0'/0/1O" (in context file ${file})`,
      ],
      [
        '{"publicKey":"02aa","network":"costwo","vaultId":7}',
        `Context file ${file} has a vaultId that is not a string`,
      ],
      [
        '{"publicKey":"02aa","network":"costwo","wallet":true}',
        `Context file ${file} has a wallet that is not a string`,
      ],
    ]) {
      fs.writeFileSync(file, content!);
      expect(() => readContextFile(file), content).to.throw(refusal);
    }
  });

  it("does not overwrite a context file that appears after its check", () => {
    fs.writeFileSync(file, "the other writer's file");
    const original = fs.existsSync;
    fs.existsSync = () => false;
    try {
      expect(() => writeContextFile(FORDEFI_CONTEXT, file)).to.throw("ctx.json already exists");
    } finally {
      fs.existsSync = original;
    }
    expect(fs.readFileSync(file, "utf8")).to.equal("the other writer's file");
  });

  it("refuses to read a missing context file and to overwrite an existing one", () => {
    // a given path is not repeated, as it may be a key given in its place; the default one is
    expect(() => readContextFile(file))
      .to.throw("The context file given with --ctx-file does not exist")
      .with.property("message")
      .that.does.not.include(file);
    const cwd = process.cwd();
    process.chdir(path.dirname(file));
    try {
      expect(() => readContextFile()).to.throw(
        "Context file ctx.json does not exist; run init-ctx first or pass --ledger / --get-hacked --env-path"
      );
    } finally {
      process.chdir(cwd);
    }
    writeContextFile(FORDEFI_CONTEXT, file);
    expect(() => writeContextFile({ ...FORDEFI_CONTEXT, vaultId: "vault-456" }, file)).to.throw(
      "ctx.json already exists"
    );
    expect(readContextFile(file).vaultId).to.equal("vault-123");
  });

  describe("the network to act on", () => {
    it("is --network when given, even with a context file of another network", () => {
      writeContextFile(FORDEFI_CONTEXT, file);
      expect(resolveNetworkName("flare", file)).to.equal("flare");
    });

    it("is the context file's network without --network", () => {
      writeContextFile(FORDEFI_CONTEXT, file);
      expect(resolveNetworkName(undefined, file)).to.equal("costwo");
    });

    it("is flare without --network and without a context file", () => {
      expect(resolveNetworkName(undefined, file)).to.equal("flare");
    });

    it("refuses an unknown --network, and a context file without a network", () => {
      expect(() => resolveNetworkName("mainnet", file)).to.throw(
        'Unknown network "mainnet"; expected one of flare, songbird, costwo, coston, localflare'
      );
      fs.writeFileSync(file, JSON.stringify({ wallet: "publicKey", publicKey: EWOQ_PUBLIC_KEY_COMPRESSED }));
      expect(() => resolveNetworkName(undefined, file)).to.throw(
        `Context file ${file} is missing publicKey or network`
      );
    });
  });
});

describe("app/env createEnv", () => {
  it("warns once per node about an API key going over plain http to another machine", () => {
    const original = console.error;
    const printed: string[] = [];
    console.error = (message: string) => printed.push(message);
    try {
      for (let i = 0; i < 3; i++)
        createEnv("localflare", { apiUrl: "http://warn-once.example:9650", apiKey: "k-e-y-1" });
      createEnv("localflare", { apiUrl: "http://localhost:9650", apiKey: "k-e-y-1" });
    } finally {
      console.error = original;
    }
    expect(printed).to.have.length(1);
    expect(printed[0]).to.include("the API key goes unencrypted to http://warn-once.example:9650 over plain http");
  });
});
