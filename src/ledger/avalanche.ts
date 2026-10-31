import AvalancheApp, { ResponseAddress, ResponseSign } from "@avalabs/hw-app-avalanche";
import { ledgerService } from "@ledgerhq/hw-app-eth";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { toBuffer, toHex } from "./bytes";
import { EthAddress, Signature } from "./interfaces";

export async function isAvalancheApp(): Promise<boolean> {
  return (await _getAppName()) === "Avalanche";
}

export async function isEthereumApp(): Promise<boolean> {
  return (await _getAppName()) === "Ethereum";
}

async function _getAppName(): Promise<string> {
  let appName = "";
  await _connect(async (app) => {
    const info = await app.getAppInfo();
    appName = info.appName;
  });
  return appName;
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  let account: ResponseAddress | undefined;
  await _connect(async (app) => {
    account = await app.getAddressAndPubKey(bip44Path, false, hrp);
  });
  if (!account || !account.publicKey) {
    throw new Error("Invalid or missing public key from ledger response");
  }

  const publicKey = toHex(account.publicKey, false);
  return publicKey;
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  let account: EthAddress | undefined;
  await _connect(async (app) => {
    account = await app.getETHAddress(bip44Path, display);
  });
  if (!account) {
    throw Error(`Failed to obtain C-chain address from ledger`);
  }
  return account.address;
}

export async function signHash(bip44Path: string, message: string): Promise<string> {
  const signPath = _getSignPath(bip44Path);
  const messageBuffer = toBuffer(message);
  let response: ResponseSign | undefined;
  await _connect(async (app) => {
    response = await app.signHash(_getAccountPath(bip44Path), [signPath], messageBuffer);
  });
  if (!response) {
    if (response && (response as ResponseSign).errorMessage !== "No errors") {
      throw new Error(`Failed to sign message on ledger:  ${(response as ResponseSign).errorMessage}`);
    }
    throw new Error(`Failed to sign message on ledger`);
  }
  const signature = response.signatures?.get(signPath)?.toString("hex");
  if (!signature) {
    throw new Error("No signature returned from ledger");
  }
  return signature;
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  let response: Signature | undefined;
  await _connect(async (app) => {
    response = await app.signEVMTransaction(bip44Path, rawTx, resolution);
  });
  if (!response) {
    throw new Error("Failed to sign EVM transaction on ledger");
  }
  if (!response.r || !response.s || !response.v) {
    throw new Error("Failed to get signature from ledger device");
  }
  const r = Buffer.from(toHex(response.r, false), "hex");
  const s = Buffer.from(toHex(response.s, false), "hex");
  let recoveryParam = parseInt(toHex(response.v, false), 16);
  if (recoveryParam === 0 || recoveryParam === 1) {
    recoveryParam += 27;
  } else if (recoveryParam > 28) {
    recoveryParam = recoveryParam % 2 === 1 ? 27 : 28;
  }
  const v = Buffer.from(recoveryParam.toString(16), "hex");
  const signature = toHex(Buffer.concat([r, s, v]), false);
  return signature;
}

async function _connect(execute: (app: AvalancheApp) => Promise<void>): Promise<void> {
  let avalanche: AvalancheApp | undefined = undefined;
  try {
    const transport = await TransportNodeHid.open(undefined);
    // Two ledger packages have slightly different Transport type definitions
    // (abortTimeoutMs optional vs explicitly undefined-able under exactOptionalPropertyTypes).
    // The runtime contract is identical.
    avalanche = new AvalancheApp(transport as unknown as ConstructorParameters<typeof AvalancheApp>[0]);
    await execute(avalanche);
  } finally {
    if (avalanche && avalanche.transport) {
      await avalanche.transport.close();
    }
  }
}

function _getAccountPath(bip44Path: string): string {
  return bip44Path.substring(0, bip44Path.length - 4);
}

function _getSignPath(bip44Path: string): string {
  return bip44Path.substring(bip44Path.length - 3);
}
