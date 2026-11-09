/**
 * The only build → sign → attach → submit → confirm implementation. Every
 * signer and every transaction type goes through here.
 */
import { buildTransaction } from "./builders";
import { builtDetails } from "./details";
import { attachSignature } from "./signing/attach";
import { submitAndConfirm, type ConfirmOptions } from "./submit";
import type { BeforeSign, Env, Outcome, Signer, TxRequest } from "./types";

/**
 * `beforeSign` gets the details of the transaction about to be signed, read from it, and can stop it there by
 * throwing: the transaction it approves is the one signed, not a second build.
 */
export async function executeTransaction(
  req: TxRequest,
  env: Env,
  signer: Signer,
  confirm: ConfirmOptions = {},
  beforeSign?: BeforeSign
): Promise<Outcome> {
  const account = await signer.account();
  const bundle = await buildTransaction(req, env, account, signer.policy);
  // Read before anything is signed or sent; the Context was already fetched to build an atomic transaction.
  const details = builtDetails(bundle, bundle.kind === "atomic" ? await env.clients.context() : undefined);
  const fee = details.fee;
  const notices = bundle.kind === "atomic" && bundle.notices?.length ? { notices: bundle.notices } : {};
  const evm =
    bundle.kind === "evm"
      ? {
          evm: {
            nonce: bundle.tx.nonce,
            gasLimit: bundle.tx.gasLimit,
            ...(details.claimed !== undefined ? { claimed: details.claimed } : {}),
            ...(bundle.txType === "setClaimExecutors" ? { executorFees: details.value } : {}),
          },
        }
      : details.nonce !== undefined
        ? { evm: { nonce: details.nonce } } // exportCP
        : {};
  await beforeSign?.(details);
  const result = await signer.sign(bundle);
  if (result.status === "pending") {
    return { ...result, fee, ...evm, ...notices };
  }
  attachSignature(bundle, result.signature, account);
  const { txId, chainStatus } = await submitAndConfirm(bundle, env.clients, confirm);
  return { status: "sent", txId, chainStatus, fee, ...evm, ...notices };
}
