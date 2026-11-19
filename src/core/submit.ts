/** One submit + confirm path per chain. */
import type { evm, pvm } from "@flarenetwork/flarejs";
import type { UnsignedTxBundle } from "./types";

/** The node calls that submitting and confirming a transaction makes. */
export interface SubmitClients {
  readonly pvm: Pick<pvm.PVMApi, "issueSignedTx" | "getTxStatus">;
  readonly evm: Pick<evm.EVMApi, "issueSignedTx" | "getAtomicTx">;
  readonly provider: {
    send(method: string, params: unknown[]): Promise<unknown>;
    /** Only the receipt's status is read. */
    getTransactionReceipt(hash: string): Promise<{ readonly status: number | null } | null>;
  };
}

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
 * The P-chain refused the transaction after it was issued (Aborted, Dropped or
 * Rejected): it is not on chain and nothing it spends was used.
 */
export class TxNotAcceptedError extends Error {
  override readonly name = "TxNotAcceptedError";
}

const DEFAULTS = { timeoutMs: 90_000, pollMs: 1_000 };

/** Final P-chain statuses that mean the transaction will never be on chain. */
const P_CHAIN_REFUSED = new Set(["Aborted", "Dropped", "Rejected"]);

/**
 * How `avax.getAtomicTx` fails for a transaction the C-chain has not accepted, and only then (go-flare 1.15.1 and
 * 1.15.2, `vms/saevm/cchain`). Other failures also say "not found" ("Method not found", a codec id): they are errors.
 */
export const NOT_ACCEPTED_YET = "fetching tx: reading tx: not found";

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

/**
 * Whether the C-chain has accepted atomic transaction `txId`. `avax.getAtomicTx` answers with the transaction once it
 * is accepted and fails with exactly `NOT_ACCEPTED_YET` until then; any other failure is reported at once. It replaces
 * `avax.getAtomicTxStatus`, which avalanchego 1.15.2 removed and which, since Helicon, answered "Accepted" or "Unknown"
 * from the same lookup: the C-chain reports no dropped atomic transaction, so one it never accepts ends in the timeout.
 */
async function cChainAccepted(evmApi: SubmitClients["evm"], txId: string): Promise<boolean> {
  try {
    await evmApi.getAtomicTx({ txID: txId });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === NOT_ACCEPTED_YET) return false;
    throw error;
  }
}

export async function submitAndConfirm(
  bundle: UnsignedTxBundle,
  clients: SubmitClients,
  options: ConfirmOptions = {}
): Promise<{ txId: string; chainStatus: string }> {
  const { timeoutMs, pollMs } = { ...DEFAULTS, ...options };
  const deadline = Date.now() + timeoutMs;

  if (bundle.kind === "evm") {
    const hash: unknown = await clients.provider.send("eth_sendRawTransaction", [bundle.tx.serialized]);
    if (typeof hash !== "string") {
      throw new Error("The node did not return a transaction hash");
    }
    options.onIssued?.(hash);
    while (Date.now() < deadline) {
      const receipt = await statusOf(hash, () => clients.provider.getTransactionReceipt(hash));
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
    const { txID } = await clients.evm.issueSignedTx(signedTx);
    options.onIssued?.(txID);
    while (Date.now() < deadline) {
      if (await statusOf(txID, () => cChainAccepted(clients.evm, txID))) return { txId: txID, chainStatus: "Accepted" };
      await sleep(pollMs);
    }
    throw new Error(`Transaction ${txID} was submitted but not accepted within ${timeoutMs}ms`);
  }

  const { txID } = await clients.pvm.issueSignedTx(signedTx);
  options.onIssued?.(txID);
  while (Date.now() < deadline) {
    const { status, reason } = await statusOf(txID, () => clients.pvm.getTxStatus({ txID }));
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
