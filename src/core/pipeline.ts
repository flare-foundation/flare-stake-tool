/**
 * The only build → sign → attach → submit → confirm implementation. Every
 * signer and every transaction type goes through here.
 */
import { buildTransaction } from "./builders";
import { atomicTxFee } from "./fee";
import { attachSignature } from "./signing/attach";
import { submitAndConfirm, type ConfirmOptions } from "./submit";
import type { Env, Outcome, Signer, TxRequest } from "./types";

export async function executeTransaction(
  req: TxRequest,
  env: Env,
  signer: Signer,
  confirm: ConfirmOptions = {}
): Promise<Outcome> {
  const account = await signer.account();
  const bundle = await buildTransaction(req, env, account, signer.policy);
  // Read before anything is signed or sent; the Context was already fetched to build an atomic transaction.
  const fee = bundle.kind === "atomic" ? atomicTxFee(bundle.unsignedTx, await env.clients.context()) : undefined;
  const result = await signer.sign(bundle);
  if (result.status === "pending") {
    return { ...result, fee };
  }
  attachSignature(bundle, result.signature, account);
  const { txId, chainStatus } = await submitAndConfirm(bundle, env, confirm);
  return { status: "sent", txId, chainStatus, fee };
}
