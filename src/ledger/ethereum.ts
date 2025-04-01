import EthApp, { ledgerService } from "@ledgerhq/hw-app-eth";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import * as pubk from "../flare/pubk";
import * as utils from "../utils";

export async function isEthereumApp() {
  let eth = false;
  await _connect(async (app) => {
    try {
      let info = await app.getAppConfiguration();
      console.log(info);
      eth = true;
    } catch {}
  });
  return eth;
}

// get address and PK
export async function getAccount(bip44Path: string): Promise<{
  publicKey: string;
  address: string;
}> {
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.getAddress(bip44Path);
  });
  if (!response || !response.publicKey || !response.address) {
    throw new Error("Failed to obtain public key from ledger");
  }
  return { publicKey: response!.publicKey, address: response!.address };
}

export async function getPublicKey(bip44Path: string): Promise<string> {
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.getAddress(bip44Path);
  });
  if (!response || !response.publicKey) {
    throw new Error("Failed to obtain public key from ledger");
  }
  return pubk.normalizePublicKey(response!.publicKey);
}

export async function getCAddress(
  bip44Path: string,
  display: boolean,
): Promise<string> {
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.getAddress(bip44Path, display);
  });
  if (!response || !response.address) {
    throw new Error("Failed to obtain C-chain address from ledger");
  }
  return response!.address;
}

export async function getPAddress(
  bip44Path: string,
  hrp: string,
  display: boolean,
): Promise<string> {
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.getAddress(bip44Path, display);
  });
  if (!response || !response.publicKey) {
    throw new Error("Failed to obtain P-chain address from ledger");
  }
  return pubk.publicKeyToPAddress(hrp, response.publicKey);
}

export async function signPersonalMessage(
  bip44Path: string,
  message: string,
): Promise<string> {
  let messageHex = utils.toHex(Buffer.from(message, "utf-8"), false);
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.signPersonalMessage(bip44Path, messageHex);
  });
  if (!response) {
    throw new Error("Failed to sign ETH personal message");
  }
  if (!response.r || !response.s || !response.v) {
    throw new Error("Failed to get signature from ledger device");
  }
  let r = Buffer.from(utils.toHex(response.r, false), "hex");
  let s = Buffer.from(utils.toHex(response.s, false), "hex");
  let v = Buffer.from(response.v.toString(16), "hex");
  let signature = utils.toHex(Buffer.concat([r, s, v]), false);
  return signature;
}

export async function signEvmTransaction(
  bip44Path: string,
  txHex: string,
): Promise<string> {
  let rawTx = utils.toHex(txHex, false);
  let resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  let response: any = undefined;
  await _connect(async (app) => {
    response = await app.signTransaction(bip44Path, rawTx, resolution);
  });
  if (!response) {
    throw new Error("Failed to sign EVM transaction on ledger");
  }
  if (!response.r || !response.s || !response.v) {
    throw new Error("Failed to get signature from ledger device");
  }
  let r = Buffer.from(utils.toHex(response.r, false), "hex");
  let s = Buffer.from(utils.toHex(response.s, false), "hex");
  let recoveryParam = parseInt(utils.toHex(response.v, false), 16);
  if (recoveryParam == 0 || recoveryParam == 1) {
    recoveryParam += 27;
  } else if (recoveryParam > 28) {
    recoveryParam = recoveryParam % 2 == 1 ? 27 : 28;
  }
  let v = Buffer.from(recoveryParam.toString(16), "hex");
  let signature = utils.toHex(Buffer.concat([r, s, v]), false);
  return signature;
}

async function _connect(
  execute: (app: EthApp) => Promise<void>,
): Promise<void> {
  let eth;
  try {
    let transport = await TransportWebHID.create();
    eth = new EthApp(transport);
    await execute(eth);
  } finally {
    if (eth && eth.transport) {
      await eth.transport.close();
    }
  }
}
