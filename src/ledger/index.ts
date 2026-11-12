/**
 * The connected Ledger: which app is open, and each operation routed to that
 * app's client. Flare signs atomic transactions in full (or their hash, for
 * types it does not parse), Avalanche signs hashes, Ethereum signs C-chain EVM
 * transactions only.
 */
import * as avalanche from "./avalanche";
import * as ethereum from "./ethereum";
import * as flare from "./flare";

export type LedgerAppName = "Flare" | "Avalanche" | "Ethereum";

/** Device app names (as the dashboard APDU reports them) → the apps this tool supports. */
const SUPPORTED_APPS: Record<string, LedgerAppName> = {
  "Flare Network": "Flare",
  Avalanche: "Avalanche",
  Ethereum: "Ethereum",
};

/**
 * Which app is open on the device. Asked again for every operation (one request
 * to the device), so that the user can switch apps between operations, as an
 * error asking them to open another app tells them to.
 */
export async function detectApp(openAppName: () => Promise<string> = flare.openAppName): Promise<LedgerAppName> {
  const name = await openAppName();
  const app = SUPPORTED_APPS[name];
  if (!app) {
    throw new Error(
      `A supported app (Flare, Avalanche or Ethereum) is not running on the connected Ledger device (open app: ${name || "none"})`
    );
  }
  return app;
}

export const ETHEREUM_APP_P_CHAIN =
  "The Ledger Ethereum app cannot sign P-chain or atomic transactions; open the Flare app and retry " +
  "(on localflare, the Avalanche app: the Flare app doesn't know that network)";

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  switch (await detectApp()) {
    case "Flare":
      return flare.getPublicKey(bip44Path, hrp);
    case "Avalanche":
      return avalanche.getPublicKey(bip44Path, hrp);
    case "Ethereum":
      return ethereum.getPublicKey(bip44Path);
  }
}

/** Shows the C-chain address on the device for the user to compare. */
export async function verifyCAddress(bip44Path: string): Promise<string> {
  switch (await detectApp()) {
    case "Flare":
      return flare.getCAddress(bip44Path, true);
    case "Avalanche":
      return avalanche.getCAddress(bip44Path, true);
    case "Ethereum":
      return ethereum.getCAddress(bip44Path, true);
  }
}

/** Signs an atomic transaction parsed on the device (Flare app only). */
export async function sign(bip44Path: string, txHex: string): Promise<string> {
  const app = await detectApp();
  if (app !== "Flare") {
    throw new Error(`Signing the full transaction is not supported by the ${app} app`);
  }
  return flare.sign(bip44Path, txHex);
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  switch (await detectApp()) {
    case "Flare":
      return flare.signEvmTransaction(bip44Path, txHex);
    case "Avalanche":
      return avalanche.signEvmTransaction(bip44Path, txHex);
    case "Ethereum":
      return ethereum.signEvmTransaction(bip44Path, txHex);
  }
}

/** Signs the 32-byte hash of an atomic transaction (blind signing). */
export async function signHash(bip44Path: string, hashHex: string): Promise<string> {
  switch (await detectApp()) {
    case "Flare":
      return flare.signHash(bip44Path, hashHex);
    case "Avalanche":
      return avalanche.signHash(bip44Path, hashHex);
    case "Ethereum":
      throw new Error(ETHEREUM_APP_P_CHAIN);
  }
}
