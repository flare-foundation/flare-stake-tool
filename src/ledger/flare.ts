import { FlareApp } from "@zondax/ledger-flare";
import { ledgerService } from "@ledgerhq/hw-app-eth";
import { evmSignatureHex, rsvHex, toBuffer, toHex } from "./bytes";
import type { EthAddress, Signature } from "./interfaces";
import { withApp } from "./transport";

const withFlare = <R>(use: (app: FlareApp) => Promise<R>): Promise<R> =>
  withApp((transport) => new FlareApp(transport), use);

/** Name of the app open on the device, from the dashboard APDU every app answers. */
export async function openAppName(): Promise<string> {
  return withFlare(async (app) => (await app.appInfo()).appName ?? "");
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  const account = await withFlare((app) => app.getAddressAndPubKey(bip44Path, hrp));
  if (account.errorMessage !== "No errors") {
    throw new Error(`Failed to obtain public key from ledger: ${account.errorMessage}, code ${account.returnCode}`);
  }
  return toHex(account.compressed_pk, false);
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  const account = await withFlare<EthAddress>((app) => app.getEVMAddress(bip44Path, display));
  return account.address;
}

/** Signs an atomic transaction parsed on the device; zondax throws an error with `errorMessage` it does not know. */
export async function sign(bip44Path: string, txHex: string): Promise<string> {
  const response = await withFlare((app) => app.sign(bip44Path, toBuffer(txHex)));
  if (response.errorMessage !== "No errors") {
    throw new Error(`Failed to sign message on ledger: ${response.errorMessage}, code ${response.returnCode}`);
  }
  return rsvHex(response, "the transaction");
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  const signature = (await withFlare((app) => app.signEVMTransaction(bip44Path, rawTx, resolution))) as Signature;
  return evmSignatureHex(signature);
}

export async function signHash(bip44Path: string, hashHex: string): Promise<string> {
  const response = await withFlare((app) => app.signHash(bip44Path, toBuffer(hashHex)));
  return rsvHex(response, "the hash");
}
