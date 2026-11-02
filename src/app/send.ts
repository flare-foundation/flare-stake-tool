/** `send -i`: attach an externally produced signature to a stored transaction and submit it. */
import { accountFromPublicKey, type Account } from "../chain/keys";
import {
  bundleFromUnsignedTxJson,
  clearSentToChain,
  isAlreadySentToChain,
  markSentToChain,
  readSignedTxJson,
} from "../core/files";
import { attachSignature } from "../core/signing/attach";
import { normalizeSignature, recoverPublicKey } from "../core/signing/signature";
import { TxNotAcceptedError, submitAndConfirm, type ConfirmOptions } from "../core/submit";
import type { Env } from "../core/types";
import { logIssued } from "../output";
import { Transaction } from "ethers";

/**
 * The file is marked as sent as soon as the node has taken the transaction, so
 * that a wait that times out or fails cannot lead to a second submission; the
 * mark is removed again only when the chain refuses the transaction (it is then
 * not on chain and may be sent again).
 */
export async function sendSignedTransaction(
  id: string,
  env: Env,
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
  const bundle = bundleFromUnsignedTxJson(signed);
  const signature = normalizeSignature(signed.signature);
  const account = expectedAccount ?? recoverAccount(bundle, signature, env.network.hrp);
  attachSignature(bundle, signature, account);
  await env.clients.verifyNetwork();
  try {
    return await submitAndConfirm(bundle, env, {
      ...confirm,
      onIssued: (txId) => {
        markSentToChain(id, cwd);
        confirm.onIssued?.(txId);
      },
    });
  } catch (error) {
    if (error instanceof TxNotAcceptedError && isAlreadySentToChain(id, cwd)) {
      clearSentToChain(id, cwd);
    }
    throw error;
  }
}

function recoverAccount(
  bundle: ReturnType<typeof bundleFromUnsignedTxJson>,
  signature: Uint8Array,
  hrp: string
): Account {
  if (bundle.kind === "atomic") {
    return accountFromPublicKey(recoverPublicKey(bundle.digest, signature), hrp);
  }
  const probe = Transaction.from(bundle.tx.unsignedSerialized);
  probe.signature = {
    r: `0x${Buffer.from(signature.slice(0, 32)).toString("hex")}`,
    s: `0x${Buffer.from(signature.slice(32, 64)).toString("hex")}`,
    v: signature[64]! + 27,
  };
  if (!probe.fromPublicKey) {
    throw new Error("Cannot recover the signer of the EVM transaction");
  }
  return accountFromPublicKey(probe.fromPublicKey, hrp);
}
