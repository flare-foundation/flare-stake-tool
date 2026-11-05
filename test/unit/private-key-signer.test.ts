/**
 * The key file of --get-hacked --env-path: the account it gives, a missing
 * file, and the optional PUBLIC_KEY that must belong to the private key.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { PrivateKeySigner } from "../../src/signers/privateKey";
import { cleanupTempDir, makeTempDir } from "../helpers/cli";
import { EWOQ_P_ADDRESS, EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const OTHER_PUBLIC_KEY = "02" + "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"; // the generator: key 1

describe("signers/privateKey key file", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir("key-file-");
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  const keyFile = (lines: string[]): string => {
    const file = path.join(dir, "keys");
    fs.writeFileSync(file, lines.join("\n") + "\n");
    return file;
  };

  it("gives the account of the private key", async () => {
    const signer = PrivateKeySigner.fromEnvFile(keyFile([`PRIVATE_KEY_HEX=${EWOQ_PRIVATE_KEY_HEX}`]), "localflare");
    expect((await signer.account()).pAddress).to.equal(EWOQ_P_ADDRESS);
  });

  it("refuses a file that does not exist", () => {
    const missing = path.join(dir, "missing");
    expect(() => PrivateKeySigner.fromEnvFile(missing, "localflare")).to.throw(`Env file ${missing} does not exist`);
  });

  it("accepts the PUBLIC_KEY of the private key and refuses any other", () => {
    expect(() =>
      PrivateKeySigner.fromEnvFile(
        keyFile([`PRIVATE_KEY_HEX=${EWOQ_PRIVATE_KEY_HEX}`, `PUBLIC_KEY=0x${EWOQ_PUBLIC_KEY_COMPRESSED}`]),
        "localflare"
      )
    ).not.to.throw();
    expect(() =>
      PrivateKeySigner.fromEnvFile(
        keyFile([`PRIVATE_KEY_HEX=${EWOQ_PRIVATE_KEY_HEX}`, `PUBLIC_KEY=${OTHER_PUBLIC_KEY}`]),
        "localflare"
      )
    ).to.throw("provided private key does not match the public key");
  });
});
