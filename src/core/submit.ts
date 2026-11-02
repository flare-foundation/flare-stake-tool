/** One submit + confirm path per chain. */
import type { Env, UnsignedTxBundle } from "./types";

export interface ConfirmOptions {
  timeoutMs?: number;
  pollMs?: number;
  /**
   * Called once the node has taken the transaction, before waiting for it to be
   * accepted: from then on it may land even if the wait times out.
   */
  onIssued?: (txId: string) => void;
}

/**
 * The chain refused the transaction after it was issued (P-chain Aborted or
 * Dropped, C-chain Dropped): it is not on chain and nothing it spends was used.
 */
export class TxNotAcceptedError extends Error {
  override readonly name = "TxNotAcceptedError";
}

const DEFAULTS = { timeoutMs: 90_000, pollMs: 1_000 };

/** Final statuses that mean the transaction will never be on chain. */
const P_CHAIN_REFUSED = new Set(["Aborted", "Dropped", "Rejected"]);
const C_CHAIN_REFUSED = new Set(["Dropped", "Rejected"]);

/**
 * A failure after the node took the transaction, which may still land: the
 * message names it. `context` is the message without the underlying error, so
 * that a formatter can rewrite that error (see `describeError`) and keep it.
 */
export class SubmittedTxError extends Error {
  override readonly name = "SubmittedTxError";
  readonly txId: string;
  readonly context: string;

  constructor(txId: string, context: string, cause: unknown) {
    super(`${context}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.txId = txId;
    this.context = context;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A status lookup for a transaction the node has already taken. */
async function statusOf<T>(txId: string, lookup: () => Promise<T>): Promise<T> {
  try {
    return await lookup();
  } catch (error) {
    throw new SubmittedTxError(txId, `Transaction ${txId} was submitted, but its status could not be read`, error);
  }
}

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
    options.onIssued?.(hash);
    while (Date.now() < deadline) {
      const receipt = await statusOf(hash, () => env.clients.provider.getTransactionReceipt(hash));
      if (receipt) {
        if (receipt.status !== 1) {
          // mined, so on chain (its nonce is used), but the call failed
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
    options.onIssued?.(txID);
    while (Date.now() < deadline) {
      const { status } = await statusOf(txID, () => env.clients.evm.getAtomicTxStatus(txID));
      if (status === "Accepted") return { txId: txID, chainStatus: status };
      if (C_CHAIN_REFUSED.has(status)) {
        throw new TxNotAcceptedError(`Transaction ${txID} was ${status.toLowerCase()} by the C-chain`);
      }
      await sleep(pollMs);
    }
    throw new Error(`Transaction ${txID} was submitted but not accepted within ${timeoutMs}ms`);
  }

  const { txID } = await env.clients.pvm.issueSignedTx(signedTx);
  options.onIssued?.(txID);
  while (Date.now() < deadline) {
    const { status, reason } = await statusOf(txID, () => env.clients.pvm.getTxStatus({ txID }));
    if (status === "Committed") return { txId: txID, chainStatus: status };
    if (P_CHAIN_REFUSED.has(status)) {
      throw new TxNotAcceptedError(
        `Transaction ${txID} was ${status.toLowerCase()} by the P-chain${reason ? `: ${reason}` : ""}`
      );
    }
    await sleep(pollMs);
  }
  throw new Error(`Transaction ${txID} was submitted but not committed within ${timeoutMs}ms`);
}
