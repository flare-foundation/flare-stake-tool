import { secp256k1 } from "@flarenetwork/flarejs";
import { SigningKey, getBytes, hexlify, keccak256, sha256 } from "ethers";
import { accountFromPublicKey, type Account } from "../chain/keys";
import { toHex } from "../core/signing/signature";
import {
  IMMEDIATE_SIGNER_POLICY,
  type BuildPolicy,
  type SignResult,
  type Signer,
  type UnsignedTxBundle,
} from "../core/types";
import type { NetworkName } from "../chain/network";
import * as ledger from "../ledger";
import { logInfo, logWarning } from "../output";

export type LedgerApp = ledger.LedgerAppName;

/** The device operations the signer needs; the real one wraps src/ledger, tests inject a fake. */
export interface LedgerDevice {
  detectApp(): Promise<LedgerApp>;
  /** Compressed or uncompressed public key, hex. */
  getPublicKey(derivationPath: string, hrp: string): Promise<string>;
  /** Signs a 32-byte hash; returns r|s|v hex. */
  signHash(derivationPath: string, hashHex: string): Promise<string>;
  /** Parses and signs the full transaction on the device (Flare app); returns r|s|v hex. */
  signTransaction(derivationPath: string, txHex: string): Promise<string>;
  /** Signs an unsigned EVM transaction serialization; returns r|s|v hex. */
  signEvmTransaction(derivationPath: string, unsignedSerializedHex: string): Promise<string>;
}

/** Environment variable that substitutes a software key for the device (tests only). */
export const FAKE_LEDGER_KEY_ENV = "FLARE_FAKE_LEDGER_KEY";

const isUnsupportedTransaction = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "errorMessage" in error &&
  typeof error.errorMessage === "string" &&
  error.errorMessage.includes("Data is invalid : Unrecognized error code");

export class LedgerSigner implements Signer {
  readonly kind = "ledger" as const;
  readonly policy: BuildPolicy = IMMEDIATE_SIGNER_POLICY;

  constructor(
    private readonly device: LedgerDevice,
    private readonly derivationPath: string,
    private readonly hrp: string
  ) {}

  async account(): Promise<Account> {
    return accountFromPublicKey(await this.device.getPublicKey(this.derivationPath, this.hrp), this.hrp);
  }

  async sign(bundle: UnsignedTxBundle): Promise<SignResult> {
    if (bundle.kind === "evm") {
      return {
        status: "signed",
        signature: getBytes(
          `0x${await this.device.signEvmTransaction(this.derivationPath, bundle.tx.unsignedSerialized.slice(2))}`
        ),
      };
    }
    const app = await this.device.detectApp();
    const digestHex = toHex(bundle.digest);
    if (app === "Ethereum") {
      throw new Error(ledger.ETHEREUM_APP_P_CHAIN);
    }
    if (app === "Avalanche") {
      return {
        status: "signed",
        signature: getBytes(`0x${await this.device.signHash(this.derivationPath, digestHex)}`),
      };
    }
    try {
      const signature = await this.device.signTransaction(this.derivationPath, toHex(bundle.unsignedTx.toBytes()));
      return { status: "signed", signature: getBytes(`0x${signature}`) };
    } catch (error) {
      if (!isUnsupportedTransaction(error)) {
        throw new Error(`Ledger signing error: ${error instanceof Error ? error.message : String(error)}`);
      }
      logInfo(
        `The Flare app does not recognise ${bundle.txType} transactions; signing the transaction hash instead (blind signing).`
      );
      return {
        status: "signed",
        signature: getBytes(`0x${await this.device.signHash(this.derivationPath, digestHex)}`),
      };
    }
  }
}

/** The connected Ledger via src/ledger (app detection is memoized there). */
export function realLedgerDevice(): LedgerDevice {
  return {
    detectApp: () => ledger.detectApp(),
    getPublicKey: (path, hrp) => ledger.getPublicKey(path, hrp),
    signHash: (path, hashHex) => ledger.signHash(path, hashHex),
    signTransaction: (path, txHex) => ledger.sign(path, txHex),
    signEvmTransaction: (path, rawHex) => ledger.signEvmTransaction(path, rawHex),
  };
}

/** Networks with real value, where a software stand-in for a Ledger is refused. */
const MAINNETS: ReadonlySet<string> = new Set<NetworkName>(["flare", "songbird"]);

/**
 * A software "device" behaving like the Flare app (hash signing with a known
 * key), for tests. It refuses the mainnets: every signing operation starts
 * from the account's public key, which is looked up for the network's hrp.
 */
export function fakeLedgerDevice(privateKey: Uint8Array): LedgerDevice {
  const signHash = async (hashHex: string): Promise<string> =>
    toHex(await secp256k1.signHash(getBytes(`0x${hashHex}`), privateKey));
  return {
    detectApp: () => Promise.resolve("Flare"),
    getPublicKey: (_path, hrp) =>
      MAINNETS.has(hrp)
        ? Promise.reject(
            new Error(
              `${FAKE_LEDGER_KEY_ENV} is set: a software key stands in for the Ledger, which is refused on ${hrp}`
            )
          )
        : Promise.resolve(hexlify(secp256k1.getPublicKey(privateKey)).slice(2)),
    signHash: (_path, hashHex) => signHash(hashHex),
    // the real app signs sha256(unsignedBytes) for atomic transactions
    signTransaction: (_path, txHex) => signHash(sha256(getBytes(`0x${txHex}`)).slice(2)),
    signEvmTransaction: (_path, rawHex) => {
      const sig = new SigningKey(hexlify(privateKey)).sign(keccak256(`0x${rawHex}`));
      return Promise.resolve(sig.r.slice(2) + sig.s.slice(2) + (sig.yParity + 27).toString(16));
    },
  };
}

/** The real device, or the test stand-in when FLARE_FAKE_LEDGER_KEY is set, which is announced on stderr. */
export function ledgerDevice(env: NodeJS.ProcessEnv = process.env): LedgerDevice {
  const fakeKey = env[FAKE_LEDGER_KEY_ENV];
  if (!fakeKey) {
    return realLedgerDevice();
  }
  logWarning(
    `${FAKE_LEDGER_KEY_ENV} is set: --ledger signs with that software key, not with a Ledger device (tests only)`
  );
  return fakeLedgerDevice(getBytes(fakeKey.startsWith("0x") ? fakeKey : `0x${fakeKey}`));
}
