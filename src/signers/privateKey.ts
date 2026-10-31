import fs from "fs";
import { secp256k1 } from "@flarenetwork/flarejs";
import { SigningKey, getBytes, hexlify } from "ethers";
import dotenv from "dotenv";
import { accountFromPrivateKey, normalizePublicKey, parsePrivateKey, type Account } from "../chain/keys";
import { equalBytes } from "../core/signing/signature";
import {
  IMMEDIATE_SIGNER_POLICY,
  type BuildPolicy,
  type SignResult,
  type Signer,
  type UnsignedTxBundle,
} from "../core/types";

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
    if (!fs.existsSync(envPath)) {
      throw new Error(`Env file ${envPath} does not exist`);
    }
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    const privateKey = parsePrivateKey({ hex: parsed["PRIVATE_KEY_HEX"], cb58: parsed["PRIVATE_KEY_CB58"] });
    const signer = new PrivateKeySigner(privateKey, hrp);
    if (parsed["PUBLIC_KEY"]) {
      const expected = normalizePublicKey(parsed["PUBLIC_KEY"]);
      if (!equalBytes(expected, secp256k1.getPublicKey(privateKey))) {
        throw new Error("provided private key does not match the public key");
      }
    }
    return signer;
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
