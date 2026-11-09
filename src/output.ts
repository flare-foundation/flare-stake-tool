import { styleText } from "node:util";
import { REDIRECT_REFUSED, nodeOfError } from "./chain/clients";
import { API_KEY_ENV, redactSecrets } from "./chain/network";
import { formatFlr, formatWei } from "./chain/units";
import { SubmittedTxError } from "./core/submit";
import type { Outcome } from "./core/types";
import { API_KEY_FLAG, RPC_URL_FLAG } from "./cli/node";

export function log(msg: string) {
  console.log(msg);
}

export function logInfo(msg: string) {
  console.log(styleText("blue", msg));
}

export function logError(msg: string) {
  console.log(styleText("red", msg));
}

export function logSuccess(msg: string) {
  console.log(styleText("green", msg));
}

/** Progress goes to stderr, like warnings, so that stdout holds only results. */
export function logProgress(msg: string) {
  console.error(styleText("blue", msg));
}

/** Printed as soon as the node takes a transaction, so that its id is known even if the wait for it fails. */
export function logIssued(txId: string) {
  logProgress(`Transaction ${txId} submitted, waiting for the chain to accept it`);
}

/**
 * The fee line of an atomic transaction: "Fee paid: …" once it is sent, "Fee: …"
 * for an unsigned file (what it will burn when sent); undefined for EVM transactions.
 */
export function describeFee(outcome: Outcome, symbol: string): string | undefined {
  if (outcome.fee === undefined) return undefined;
  return outcome.status === "sent"
    ? `Fee paid: ${formatFlr(outcome.fee)} ${symbol}`
    : `Fee: ${formatFlr(outcome.fee)} ${symbol} (burned when the signed transaction is sent)`;
}

/**
 * The lines of a C-chain transaction's values that may come from the chain: its nonce (also exportCP's), its gas limit,
 * the amount a claim takes and the executor fees setClaimExecutors pays. ForDefi co-signers pass the same `--nonce`,
 * `--gas-limit` and `-a` to build the same transaction; the executor fees are the executors' current ones, to compare.
 */
export function describeEvmValues(outcome: Outcome, symbol: string): string[] {
  if (outcome.evm === undefined) return [];
  const { nonce, gasLimit, claimed, executorFees } = outcome.evm;
  return [
    `Nonce: ${nonce}`,
    ...(gasLimit !== undefined ? [`Gas limit: ${gasLimit}`] : []),
    ...(claimed !== undefined ? [`Claim amount: ${formatWei(claimed)} ${symbol}`] : []),
    ...(executorFees !== undefined ? [`Executor fees: ${formatWei(executorFees)} ${symbol}`] : []),
  ];
}

/** What the command line and interactive mode print once a transaction is sent or its unsigned file written. */
export function reportOutcome(outcome: Outcome, symbol: string): void {
  if (outcome.status === "sent") {
    logSuccess(`Transaction with hash ${outcome.txId} built and sent to the network`);
  } else {
    logSuccess(`Unsigned transaction ${outcome.id} constructed`);
    logSuccess(`ForDefi hash: ${outcome.forDefiHash}`);
  }
  const fee = describeFee(outcome, symbol);
  if (fee) logInfo(fee);
  for (const line of describeEvmValues(outcome, symbol)) logInfo(line);
  for (const notice of outcome.notices ?? []) logWarning(notice);
}

/** Warnings go to stderr so that stdout (transaction ids, hashes) stays parseable. */
export function logWarning(msg: string) {
  console.error(styleText("yellow", `Warning: ${msg}`));
}

const NODE_HINT = `; check ${RPC_URL_FLAG} and the API key (${API_KEY_FLAG} or ${API_KEY_ENV})`;

const REDIRECT_TEXT =
  "The node answered with a redirect, which a request carrying the API key does not follow (the key would go to " +
  `whatever host it names); give the URL it redirects to with ${RPC_URL_FLAG}`;

/**
 * The message for the top-level error handlers, cleaned of credentials (`redactSecrets`). A gateway that refuses a
 * request answers with an HTML error page: ethers reports the status, flarejs fails to parse the page as JSON. Both
 * get a hint instead of the raw dump. An error from a node request also gets its causes ("fetch failed" alone says
 * nothing) and the node's URL.
 */
export function describeError(error: unknown): string {
  return redactSecrets(describeUncleaned(error));
}

function describeUncleaned(error: unknown): string {
  if (error instanceof SubmittedTxError) {
    return `${error.context}: ${describeUncleaned(error.cause)}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const refused = /server response (40[13]) ([^(]*?)\s*(?:\(|$)/.exec(message);
  // a refused redirect, worded by fetch ("fetch failed", caused by it) or by refuseRedirects (with its target)
  const redirect = [message, ...causeMessages(error)].find((text) => text.startsWith(REDIRECT_REFUSED));
  const text = refused
    ? `The node answered HTTP ${refused[1]} ${refused[2]}${NODE_HINT}`
    : redirect !== undefined
      ? REDIRECT_TEXT
      : /Unexpected token '<'.*is not valid JSON/.test(message)
        ? `The node answered with an error page instead of JSON-RPC (${message})${NODE_HINT}`
        : message;
  const node = nodeOfError(error);
  if (node === undefined) return text; // other wrappers (keys, Ledger) already carry their cause's message
  const causes = redirect !== undefined ? [redirect] : causeMessages(error).filter((cause) => !text.includes(cause));
  const details = [...causes, `node ${node}`];
  return `${text} (${details.join("; ")})`;
}

/** The distinct messages below an error: its cause chain and an AggregateError's errors, each once, cycles cut. */
function causeMessages(error: unknown, depth = 0, seen = new Set<unknown>([error]), found: string[] = []): string[] {
  if (depth > 5 || typeof error !== "object" || error === null) return found;
  const below = [
    ...(error instanceof AggregateError ? (error.errors as unknown[]) : []),
    (error as { cause?: unknown }).cause,
  ];
  for (const inner of below) {
    if (inner === undefined || inner === null || seen.has(inner)) continue;
    seen.add(inner);
    const message = (inner instanceof Error ? inner.message : typeof inner === "string" ? inner : "").trim();
    if (message && !found.includes(message)) found.push(message);
    causeMessages(inner, depth + 1, seen, found);
  }
  return found;
}
