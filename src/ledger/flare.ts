import { FlareApp, ResponseAddress, ResponseSign } from "@zondax/ledger-flare";
import { ledgerService } from "@ledgerhq/hw-app-eth";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { toBuffer, toHex } from "./bytes";
import { EthAddress, Signature } from "./interfaces";

export async function isFlareApp() {
  let flare = false;
  await _connect(async (app) => {
    const info = await app.appInfo();
    flare = info.appName === "Flare Network";
  });
  return flare;
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  let account: ResponseAddress | undefined;
  await _connect(async (app) => {
    account = await app.getAddressAndPubKey(bip44Path, hrp);
  });
  if (!account) {
    throw Error("Failed to obtain public key from ledger");
  } else if (account.errorMessage !== "No errors") {
    throw Error(`Failed to obtain public key from ledger: ${account.errorMessage}, code ${account.returnCode}`);
  }
  const publicKey = toHex(account.compressed_pk, false);
  return publicKey;
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  let account: EthAddress | undefined;
  await _connect(async (app) => {
    account = await app.getEVMAddress(bip44Path, display);
  });
  if (!account) {
    throw Error(`Failed to obtain C-chain address from ledger`);
  }
  return account.address;
}

export async function sign(bip44Path: string, tx: string): Promise<string> {
  const txBuffer = toBuffer(tx);
  let response: ResponseSign | undefined;
  await _connect(async (app) => {
    response = await app.sign(bip44Path, txBuffer);
  });
  if (!response) {
    throw new Error("Failed to sign message on ledger");
  } else if (response.errorMessage !== "No errors") {
    throw new Error(`Failed to sign message on ledger: ${response.errorMessage}, code ${response.returnCode}`);
  }
  return _getSignatureFromResponse(response);
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  let response: Signature | undefined;
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
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

export async function signHash(bip44Path: string, message: string): Promise<string> {
  const messageBuffer = toBuffer(message);
  let response: ResponseSign | undefined;
  await _connect(async (app) => {
    response = await app.signHash(bip44Path, messageBuffer);
  });
  if (!response) {
    if (response && (response as ResponseSign).errorMessage !== "No errors") {
      throw new Error(`Failed to sign message on ledger:  ${(response as ResponseSign).errorMessage}`);
    }
    throw new Error("Failed to sign message on ledger");
  }
  return _getSignatureFromResponse(response);
}

async function _connect(execute: (app: FlareApp) => Promise<void>): Promise<void> {
  let flare;
  try {
    const transport = await TransportNodeHid.open(undefined);
    flare = new FlareApp(transport);
    await execute(flare);
  } finally {
    if (flare && flare.transport) {
      await flare.transport.close();
    }
  }
}

function _getSignatureFromResponse(response: ResponseSign): string {
  if (!response.r || !response.s || !response.v) {
    throw new Error("Failed to get signature from ledger device");
  }
  const signature = Buffer.concat([response.r, response.s, response.v]).toString("hex");
  return signature;
}
