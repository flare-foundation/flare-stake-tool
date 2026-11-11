import { FlareApp, type ResponseBase } from "@zondax/ledger-flare";
import { ledgerService } from "@ledgerhq/hw-app-eth";
import { evmSignatureHex, rsvHex, toBuffer, toHex } from "./bytes";
import type { EthAddress, Signature } from "./interfaces";
import { withApp } from "./transport";

const withFlare = <R>(use: (app: FlareApp) => Promise<R>): Promise<R> =>
  withApp((transport) => new FlareApp(transport), use);

/** The status of a successful APDU; zondax sends it with the text "No errors", which is not what is checked. */
const SW_OK = 0x9000;

/** Throws `failure` with the device's message and status unless the Flare app answered with success. */
export function checkFlareResponse(response: ResponseBase, failure: string): void {
  if (response.returnCode !== SW_OK) {
    throw new Error(`${failure}: ${response.errorMessage}, code ${response.returnCode}`);
  }
}

/** Name of the app open on the device, from the dashboard APDU every app answers. */
export async function openAppName(): Promise<string> {
  return withFlare(async (app) => (await app.appInfo()).appName ?? "");
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  const account = await withFlare((app) => app.getAddressAndPubKey(bip44Path, hrp));
  checkFlareResponse(account, "Failed to obtain public key from ledger");
  return toHex(account.compressed_pk, false);
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  const account = await withFlare<EthAddress>((app) => app.getEVMAddress(bip44Path, display));
  return account.address;
}

/** Signs an atomic transaction parsed on the device; zondax throws an error with `errorMessage` it does not know. */
export async function sign(bip44Path: string, txHex: string): Promise<string> {
  const response = await withFlare((app) => app.sign(bip44Path, toBuffer(txHex)));
  checkFlareResponse(response, "Failed to sign message on ledger");
  return rsvHex(response, "the transaction");
}

/** zondax's `DataIsInvalid`: the Flare app's answer to a C-chain transaction it refuses, as on localflare. */
const DATA_INVALID = 0x6984;

export const FLARE_APP_EVM_REFUSED =
  "the Flare app refused the transaction (0x6984, data invalid); on localflare, use the Avalanche or Ethereum app: " +
  "the Flare app doesn't know that chain";

/**
 * The error for a C-chain transaction the Flare app did not sign. Its EVM signing throws the bare device status
 * (`Ledger device: UNKNOWN_ERROR (0x6984)`), so it is named as a signing error, and 0x6984 says what to do instead.
 */
export function flareEvmSigningError(error: unknown): Error {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
  const reason =
    status === DATA_INVALID ? FLARE_APP_EVM_REFUSED : error instanceof Error ? error.message : String(error);
  return new Error(`Ledger signing error: ${reason}`, { cause: error });
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  const signature = (await withFlare(async (app) => {
    try {
      return await app.signEVMTransaction(bip44Path, rawTx, resolution);
    } catch (error) {
      throw flareEvmSigningError(error);
    }
  })) as Signature;
  return evmSignatureHex(signature);
}

export async function signHash(bip44Path: string, hashHex: string): Promise<string> {
  const response = await withFlare((app) => app.signHash(bip44Path, toBuffer(hashHex)));
  checkFlareResponse(response, "Failed to sign the hash on ledger");
  return rsvHex(response, "the hash");
}
