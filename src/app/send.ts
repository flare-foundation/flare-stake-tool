/** `send -i`: attach an externally produced signature to a stored transaction and submit it. */
import { accountFromPublicKey, type Account } from "../chain/keys";
import {
  bundleFromConsistentTxJson,
  clearSentToChain,
  isAlreadySentToChain,
  markSentToChain,
  readSignedTxJson,
  signerMismatch,
} from "../core/files";
import { attachEvmSignature, attachSignature } from "../core/signing/attach";
import { normalizeSignature, recoverPublicKey } from "../core/signing/signature";
import {
  SubmittedTxError,
  TxNotAcceptedError,
  submitAndConfirm,
  type ConfirmOptions,
  type SubmitClients,
} from "../core/submit";
import type { Clients } from "../chain/clients";
import type { UnsignedTxBundle } from "../core/types";
import type { NetworkConfig } from "../chain/network";
import { logIssued } from "../output";
import { Transaction } from "ethers";

/** What `send` uses of an Env: the address prefix, the network check and the submit calls. */
export interface SendEnv {
  readonly network: Pick<NetworkConfig, "hrp">;
  readonly clients: SubmitClients & Pick<Clients, "verifyNetwork">;
}

/**
 * The file is marked as sent as soon as the node has taken the transaction, so
 * that a wait that times out or fails cannot lead to a second submission; the
 * mark is removed again only when the chain refuses the transaction (it is then
 * not on chain and may be sent again).
 */
export async function sendSignedTransaction(
  id: string,
  env: SendEnv,
  expectedAccount: Account | undefined,
  cwd: string = process.cwd(),
  confirm: ConfirmOptions = { onIssued: logIssued }
): Promise<{ txId: string; chainStatus: string }> {
  if (isAlreadySentToChain(id, cwd)) {
    throw new Error(
      "Tx already sent to chain (the node took it before; check its status with the id printed then, " +
        "or remove isSentToChain from the signed file to send it again)"
    );
  }
  const signed = readSignedTxJson(id, cwd);
  const bundle = bundleFromConsistentTxJson(signed);
  const signature = normalizeSignature(signed.signature);
  // who signed, whatever the context says: it must be the account the file was built for, when the file records it
  const signer = recoverAccount(bundle, signature, env.network.hrp);
  const mismatch = signerMismatch(signed, signer.publicKey);
  if (mismatch) {
    throw new Error(
      `Transaction ${id} was built for ${mismatch.recorded}, but it is signed by ${mismatch.actual}; ` +
        "it is not sent"
    );
  }
  // and the context's account, when there is one
  attachSignature(bundle, signature, expectedAccount ?? signer);
  await env.clients.verifyNetwork();
  try {
    return await submitAndConfirm(bundle, env.clients, {
      ...confirm,
      onIssued: (txId) => {
        confirm.onIssued?.(txId); // the id first, so that it is known even if the file cannot be marked
        try {
          markSentToChain(id, cwd);
        } catch (error) {
          throw new SubmittedTxError(
            txId,
            `Transaction ${txId} was submitted, but signed transaction ${id} could not be marked as sent`,
            error
          );
        }
      },
    });
  } catch (error) {
    if (error instanceof TxNotAcceptedError && isAlreadySentToChain(id, cwd)) {
      clearSentToChain(id, cwd);
    }
    throw error;
  }
}

function recoverAccount(bundle: UnsignedTxBundle, signature: Uint8Array, hrp: string): Account {
  if (bundle.kind === "atomic") {
    return accountFromPublicKey(recoverPublicKey(bundle.digest, signature), hrp);
  }
  const probe = Transaction.from(bundle.tx.unsignedSerialized); // a copy: the bundle itself stays unsigned
  attachEvmSignature(probe, signature);
  if (!probe.fromPublicKey) {
    throw new Error("Cannot recover the signer of the EVM transaction");
  }
  return accountFromPublicKey(probe.fromPublicKey, hrp);
}
