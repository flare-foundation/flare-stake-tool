import fs from "fs";
import { secp256k1 } from "@flarenetwork/flarejs";
import { SigningKey, getBytes, hexlify } from "ethers";
import dotenv from "dotenv";
import {
  accountFromPrivateKey,
  accountFromPublicKey,
  normalizePublicKey,
  parsePrivateKey,
  type Account,
} from "../chain/keys";
import { equalBytes } from "../core/signing/signature";
import {
  IMMEDIATE_SIGNER_POLICY,
  type BuildPolicy,
  type SignResult,
  type Signer,
  type UnsignedTxBundle,
} from "../core/types";

/** A key file's lines, read without touching process.env. */
function readKeyFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Env file ${envPath} does not exist`);
  }
  return dotenv.parse(fs.readFileSync(envPath));
}

/** The `PUBLIC_KEY` of a key file that holds no private key: it gives an account, but signs nothing. */
function publicKeyOnly(lines: Record<string, string>): string | undefined {
  const publicKey = lines["PUBLIC_KEY"]?.trim();
  const privateKey = lines["PRIVATE_KEY_HEX"]?.trim() || lines["PRIVATE_KEY_CB58"]?.trim();
  return publicKey && !privateKey ? publicKey : undefined;
}

/** The signer of a key file's private key, which its optional `PUBLIC_KEY` must match. */
function signerOf(lines: Record<string, string>, hrp: string): PrivateKeySigner {
  const privateKey = parsePrivateKey({ hex: lines["PRIVATE_KEY_HEX"], cb58: lines["PRIVATE_KEY_CB58"] });
  if (lines["PUBLIC_KEY"]) {
    const expected = normalizePublicKey(lines["PUBLIC_KEY"]);
    if (!equalBytes(expected, secp256k1.getPublicKey(privateKey))) {
      throw new Error("provided private key does not match the public key");
    }
  }
  return new PrivateKeySigner(privateKey, hrp);
}

/** Signs in-process with a private key ("--get-hacked --env-path"). */
export class PrivateKeySigner implements Signer {
  readonly kind = "privateKey" as const;
  readonly policy: BuildPolicy = IMMEDIATE_SIGNER_POLICY;

  constructor(
    private readonly privateKey: Uint8Array,
    private readonly hrp: string
  ) {}

  /**
   * Reads `PRIVATE_KEY_HEX` and/or `PRIVATE_KEY_CB58` from a dotenv-style file
   * without touching process.env. An optional `PUBLIC_KEY` must match the key.
   */
  static fromEnvFile(envPath: string, hrp: string): PrivateKeySigner {
    const lines = readKeyFile(envPath);
    if (publicKeyOnly(lines) !== undefined) {
      throw new Error(`Env file ${envPath} holds only a PUBLIC_KEY; signing needs PRIVATE_KEY_HEX or PRIVATE_KEY_CB58`);
    }
    return signerOf(lines, hrp);
  }

  /**
   * The account of a key file, where nothing is signed with it (`info`, `send`'s signature check, an unsigned file):
   * its private key's, or a `PUBLIC_KEY` alone, which 4.4.0 took as well.
   */
  static accountOfEnvFile(envPath: string, hrp: string): Promise<Account> {
    const lines = readKeyFile(envPath);
    const publicKey = publicKeyOnly(lines);
    if (publicKey === undefined) return signerOf(lines, hrp).account();
    try {
      return Promise.resolve(accountFromPublicKey(publicKey, hrp));
    } catch (error) {
      throw new Error(
        `PUBLIC_KEY in ${envPath} is not a valid public key (${error instanceof Error ? error.message : String(error)})`,
        { cause: error }
      );
    }
  }

  account(): Promise<Account> {
    return Promise.resolve(accountFromPrivateKey(this.privateKey, this.hrp));
  }

  async sign(bundle: UnsignedTxBundle): Promise<SignResult> {
    if (bundle.kind === "atomic") {
      return { status: "signed", signature: await secp256k1.signHash(bundle.digest, this.privateKey) };
    }
    const sig = new SigningKey(hexlify(this.privateKey)).sign(hexlify(bundle.digest));
    const signature = new Uint8Array([...getBytes(sig.r), ...getBytes(sig.s), sig.yParity]);
    return { status: "signed", signature };
  }
}
