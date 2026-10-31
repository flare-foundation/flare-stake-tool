/**
 * The only build → sign → attach → submit → confirm implementation. Every
 * signer and every transaction type goes through here.
 */
import { buildTransaction } from "./builders";
import { attachSignature } from "./signing/attach";
import { submitAndConfirm } from "./submit";
import type { Env, Outcome, Signer, TxRequest } from "./types";

export async function executeTransaction(req: TxRequest, env: Env, signer: Signer): Promise<Outcome> {
  const account = await signer.account();
  const bundle = await buildTransaction(req, env, account, signer.policy);
  const result = await signer.sign(bundle);
  if (result.status === "pending") {
    return result;
  }
  attachSignature(bundle, result.signature, account);
  const { txId, chainStatus } = await submitAndConfirm(bundle, env);
  return { status: "sent", txId, chainStatus };
}
