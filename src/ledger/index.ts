import * as avalanche from "./avalanche";
import * as ethereum from "./ethereum";
import * as flare from "./flare";
import { toHex } from "./bytes";

const AVALANCHE = "Avalanche" as const;
const ETHEREUM = "Ethereum" as const;
const FLARE = "Flare" as const;

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  const app = await _getApp();
  if (app === FLARE) {
    return await flare.getPublicKey(bip44Path, hrp);
  } else if (app === AVALANCHE) {
    return await avalanche.getPublicKey(bip44Path, hrp);
  } else if (app === ETHEREUM) {
    return await ethereum.getPublicKey(bip44Path);
  } else {
    return "";
  }
}

export async function verifyCAddress(bip44Path: string): Promise<string> {
  const app = await _getApp();
  if (app === FLARE) {
    return await flare.getCAddress(bip44Path, true);
  } else if (app === AVALANCHE) {
    return await avalanche.getCAddress(bip44Path, true);
  } else if (app === ETHEREUM) {
    return await ethereum.getCAddress(bip44Path, true);
  } else {
    return "";
  }
}

export async function onlyHashSign(): Promise<boolean> {
  const app = await _getApp();
  return app === AVALANCHE || app === ETHEREUM;
}

export async function sign(bip44Path: string, tx: string): Promise<string> {
  const app = await _getApp();
  if (app === FLARE) {
    return await flare.sign(bip44Path, tx);
  } else if (app === AVALANCHE) {
    throw new Error("Nonblind signing of transactions is not supported on Avalanche app");
  } else if (app === ETHEREUM) {
    throw new Error("Nonblind signing of transactions is not supported on Ethereum app");
  } else {
    return "";
  }
}

export async function signEvmTransaction(bip44Path: string, tx: string): Promise<string> {
  const app = await _getApp();
  if (app === FLARE) {
    return await flare.signEvmTransaction(bip44Path, tx);
  } else if (app === AVALANCHE) {
    return await avalanche.signEvmTransaction(bip44Path, tx);
  } else if (app === ETHEREUM) {
    return await ethereum.signEvmTransaction(bip44Path, tx);
  } else {
    return "";
  }
}

export async function signHash(bip44Path: string, message: string): Promise<string> {
  const app = await _getApp();
  if (app === FLARE) {
    return await flare.signHash(bip44Path, message);
  } else if (app === AVALANCHE) {
    return await avalanche.signHash(bip44Path, message);
  } else if (app === ETHEREUM) {
    return await ethereum.signPersonalMessage(bip44Path, toHex(message, false));
  } else {
    return "";
  }
}

export type LedgerAppName = "Flare" | "Avalanche" | "Ethereum";

let detectedApp: Promise<LedgerAppName> | undefined;

/** Which app is open on the device; probed once per process. */
export function detectApp(): Promise<LedgerAppName> {
  detectedApp ??= (async () => {
    if (await flare.isFlareApp()) {
      return FLARE;
    } else if (await avalanche.isAvalancheApp()) {
      return AVALANCHE;
    } else if (await avalanche.isEthereumApp()) {
      return ETHEREUM;
    }
    throw new Error("A supported app (Flare or Avalanche) is not running on the connected Ledger device");
  })().catch((error: unknown) => {
    detectedApp = undefined;
    throw error;
  });
  return detectedApp;
}

async function _getApp(): Promise<string> {
  return detectApp();
}
