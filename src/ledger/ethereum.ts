import EthApp, { ledgerService } from "@ledgerhq/hw-app-eth";
import { evmSignatureHex, toHex } from "./bytes";
import type { Signature } from "./interfaces";
import { withApp } from "./transport";

/** The Ethereum app: C-chain EVM transactions only (it cannot sign P-chain or atomic transactions). */
const withEthereum = <R>(use: (app: EthApp) => Promise<R>): Promise<R> =>
  withApp((transport) => new EthApp(transport), use);

export async function getPublicKey(bip44Path: string): Promise<string> {
  const response = await withEthereum((app) => app.getAddress(bip44Path));
  if (!response.publicKey) {
    throw new Error("Failed to obtain public key from ledger");
  }
  return response.publicKey;
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  const response = await withEthereum((app) => app.getAddress(bip44Path, display));
  if (!response.address) {
    throw new Error("Failed to obtain C-chain address from ledger");
  }
  return response.address;
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  const signature: Signature = await withEthereum((app) => app.signTransaction(bip44Path, rawTx, resolution));
  return evmSignatureHex(signature);
}
