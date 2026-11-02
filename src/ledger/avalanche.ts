import AvalancheApp from "@avalabs/hw-app-avalanche";
import { ledgerService } from "@ledgerhq/hw-app-eth";
import { evmSignatureHex, toBuffer, toHex } from "./bytes";
import type { EthAddress, Signature } from "./interfaces";
import { withApp } from "./transport";

// The two ledger packages declare slightly different Transport types (abortTimeoutMs optional vs
// explicitly undefined-able under exactOptionalPropertyTypes); the runtime contract is identical.
const withAvalanche = <R>(use: (app: AvalancheApp) => Promise<R>): Promise<R> =>
  withApp((transport) => new AvalancheApp(transport as unknown as ConstructorParameters<typeof AvalancheApp>[0]), use);

/**
 * The Avalanche app signs a hash with an account path and the remaining path
 * relative to it: m/44'/60'/0'/0/10 → account m/44'/60'/0', signing path 0/10.
 * Split on "/" rather than at fixed offsets, which broke on multi-digit indices.
 */
export function splitAvalanchePath(bip44Path: string): { accountPath: string; signPath: string } {
  const parts = bip44Path.split("/");
  if (parts.length !== 6 || parts[0] !== "m") {
    throw new Error(
      `Unsupported derivation path for the Avalanche app: ${bip44Path} (expected m/44'/coin'/account'/change/index)`
    );
  }
  return { accountPath: parts.slice(0, 4).join("/"), signPath: parts.slice(4).join("/") };
}

export async function getPublicKey(bip44Path: string, hrp: string): Promise<string> {
  const account = await withAvalanche((app) => app.getAddressAndPubKey(bip44Path, false, hrp));
  if (!account.publicKey) {
    throw new Error("Invalid or missing public key from ledger response");
  }
  return toHex(account.publicKey, false);
}

export async function getCAddress(bip44Path: string, display: boolean): Promise<string> {
  const account = await withAvalanche<EthAddress>((app) => app.getETHAddress(bip44Path, display));
  return account.address;
}

export async function signHash(bip44Path: string, hashHex: string): Promise<string> {
  const { accountPath, signPath } = splitAvalanchePath(bip44Path);
  const response = await withAvalanche((app) => app.signHash(accountPath, [signPath], toBuffer(hashHex)));
  const signature = response.signatures?.get(signPath)?.toString("hex");
  if (!signature) {
    throw new Error(`No signature returned from ledger${response.errorMessage ? `: ${response.errorMessage}` : ""}`);
  }
  return signature;
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
  const rawTx = toHex(txHex, false);
  const resolution = await ledgerService.resolveTransaction(rawTx, {}, {});
  const signature = (await withAvalanche((app) => app.signEVMTransaction(bip44Path, rawTx, resolution))) as Signature;
  return evmSignatureHex(signature);
}
