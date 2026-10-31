/** One submit + confirm path per chain. */
import type { Env, UnsignedTxBundle } from "./types";

export interface ConfirmOptions {
  timeoutMs?: number;
  pollMs?: number;
}

const DEFAULTS = { timeoutMs: 90_000, pollMs: 1_000 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function submitAndConfirm(
  bundle: UnsignedTxBundle,
  env: Env,
  options: ConfirmOptions = {}
): Promise<{ txId: string; chainStatus: string }> {
  const { timeoutMs, pollMs } = { ...DEFAULTS, ...options };
  const deadline = Date.now() + timeoutMs;

  if (bundle.kind === "evm") {
    const hash: unknown = await env.clients.provider.send("eth_sendRawTransaction", [bundle.tx.serialized]);
    if (typeof hash !== "string") {
      throw new Error("The node did not return a transaction hash");
    }
    while (Date.now() < deadline) {
      const receipt = await env.clients.provider.getTransactionReceipt(hash);
      if (receipt) {
        if (receipt.status !== 1) {
          throw new Error(`Transaction ${hash} was mined but reverted`);
        }
        return { txId: hash, chainStatus: "Confirmed" };
      }
      await sleep(pollMs);
    }
    throw new Error(`Transaction ${hash} was submitted but not mined within ${timeoutMs}ms`);
  }

  const signedTx = bundle.unsignedTx.getSignedTx();
  if (bundle.chain === "C") {
    const { txID } = await env.clients.evm.issueSignedTx(signedTx);
    while (Date.now() < deadline) {
      const { status } = await env.clients.evm.getAtomicTxStatus(txID);
      if (status === "Accepted") return { txId: txID, chainStatus: status };
      if (status === "Rejected" || status === "Dropped")
        throw new Error(`Transaction ${txID} was ${status.toLowerCase()} by the C-chain`);
      await sleep(pollMs);
    }
    throw new Error(`Transaction ${txID} was submitted but not accepted within ${timeoutMs}ms`);
  }

  const { txID } = await env.clients.pvm.issueSignedTx(signedTx);
  while (Date.now() < deadline) {
    const { status, reason } = await env.clients.pvm.getTxStatus({ txID });
    if (status === "Committed") return { txId: txID, chainStatus: status };
    if (status === "Rejected" || status === "Dropped") {
      throw new Error(`Transaction ${txID} was ${status.toLowerCase()} by the P-chain${reason ? `: ${reason}` : ""}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`Transaction ${txID} was submitted but not committed within ${timeoutMs}ms`);
}
