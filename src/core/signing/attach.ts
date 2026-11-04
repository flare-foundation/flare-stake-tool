/**
 * Attaches one account's signature to every credential slot it owns. Computed
 * from the transaction itself (not from the builder), so `send -i` on a file
 * behaves exactly like immediate signing.
 */
import type { UnsignedTx } from "@flarenetwork/flarejs";
import { Transaction, getAddress, hexlify } from "ethers";
import type { Account } from "../../chain/keys";
import type { UnsignedTxBundle } from "../types";
import { equalBytes, normalizeSignature, recoverPublicKey } from "./signature";

interface AuthorizedTx {
  /** Transactions carrying an authorization input (SetAutoRenewedValidatorConfigTx, subnet txs). */
  getAuth?: () => { values(): number[] };
}

/**
 * Credential coordinates [credentialIndex, signatureIndex] the account signs:
 * every input it owns, plus the trailing authorization credential of a
 * SetAutoRenewedValidatorConfigTx. flarejs maps only the inputs, so that last
 * credential would otherwise stay empty.
 */
export function signatureSlots(unsignedTx: UnsignedTx, publicKey: Uint8Array): [number, number][] {
  const slots: [number, number][] = [...(unsignedTx.getSigIndicesForPubKey(publicKey) ?? [])];
  const tx = unsignedTx.getTx() as AuthorizedTx;
  if (typeof tx.getAuth === "function") {
    const credentialIndex = unsignedTx.getCredentials().length - 1;
    tx.getAuth()
      .values()
      .forEach((_, signatureIndex) => slots.push([credentialIndex, signatureIndex]));
  }
  return slots;
}

const EMPTY_SIGNATURE_HEX = "0x" + "00".repeat(65);

/**
 * True when no credential slot still holds the placeholder signature. flarejs'
 * own `hasAllSignatures` additionally re-derives P-style addresses, which fails
 * for C-chain atomic transactions reloaded from JSON; the signer check above
 * already covers who signed.
 */
export function isFullySigned(unsignedTx: UnsignedTx): boolean {
  return unsignedTx
    .getCredentials()
    .every((credential) => credential.getSignatures().every((sig) => sig !== EMPTY_SIGNATURE_HEX));
}

/** Attaches a 65-byte r|s|v signature for `account` to the bundle, verifying it first. */
export function attachSignature(bundle: UnsignedTxBundle, signature: Uint8Array | string, account: Account): void {
  const sig = normalizeSignature(signature);
  if (bundle.kind === "atomic") {
    const recovered = recoverPublicKey(bundle.digest, sig);
    if (!equalBytes(recovered, account.publicKey)) {
      throw new Error("The signature does not belong to the configured account (recovered public key differs)");
    }
    const slots = signatureSlots(bundle.unsignedTx, account.publicKey);
    if (slots.length === 0) {
      throw new Error("The configured account does not own any input of this transaction");
    }
    for (const [credentialIndex, signatureIndex] of slots) {
      bundle.unsignedTx.addSignatureAt(sig, credentialIndex, signatureIndex);
    }
    if (!isFullySigned(bundle.unsignedTx)) {
      throw new Error("The transaction still has unsigned credentials");
    }
    return;
  }
  attachEvmSignature(bundle.tx, sig);
  if (bundle.tx.from === null || getAddress(bundle.tx.from) !== account.cAddress) {
    throw new Error("The signature does not belong to the configured account (recovered address differs)");
  }
}

/** Sets a 65-byte signature on an ethers Transaction; v may be 0/1 or 27/28. */
export function attachEvmSignature(tx: Transaction, signature: Uint8Array | string): void {
  const sig = normalizeSignature(signature);
  tx.signature = {
    r: hexlify(sig.slice(0, 32)),
    s: hexlify(sig.slice(32, 64)),
    v: sig[64]! + 27,
  };
}
