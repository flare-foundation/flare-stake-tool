/** `send -i`: attach an externally produced signature to a stored transaction and submit it. */
import { accountFromPublicKey, type Account } from "../chain/keys";
import { bundleFromUnsignedTxJson, isAlreadySentToChain, markSentToChain, readSignedTxJson } from "../core/files";
import { attachSignature } from "../core/signing/attach";
import { normalizeSignature, recoverPublicKey } from "../core/signing/signature";
import { submitAndConfirm } from "../core/submit";
import type { Env } from "../core/types";
import { Transaction } from "ethers";

export async function sendSignedTransaction(
  id: string,
  env: Env,
  expectedAccount: Account | undefined,
  cwd: string = process.cwd()
): Promise<{ txId: string; chainStatus: string }> {
  if (isAlreadySentToChain(id, cwd)) {
    throw new Error("Tx already sent to chain");
  }
  const signed = readSignedTxJson(id, cwd);
  const bundle = bundleFromUnsignedTxJson(signed);
  const signature = normalizeSignature(signed.signature);
  const account = expectedAccount ?? recoverAccount(bundle, signature, env.network.hrp);
  attachSignature(bundle, signature, account);
  const result = await submitAndConfirm(bundle, env);
  markSentToChain(id, cwd);
  return result;
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
