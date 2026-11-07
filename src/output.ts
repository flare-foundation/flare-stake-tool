import { styleText } from "node:util";
import { API_KEY_ENV } from "./chain/network";
import { formatFlr } from "./chain/units";
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

/**
 * Printed as soon as the node takes a transaction, so that its id is known even
 * if the wait for it fails. Progress goes to stderr, like warnings, so that
 * stdout holds only results.
 */
export function logIssued(txId: string) {
  console.error(styleText("blue", `Transaction ${txId} submitted, waiting for the chain to accept it`));
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
  for (const notice of outcome.notices ?? []) logWarning(notice);
}

/** Warnings go to stderr so that stdout (transaction ids, hashes) stays parseable. */
export function logWarning(msg: string) {
  console.error(styleText("yellow", `Warning: ${msg}`));
}

const NODE_HINT = `; check ${RPC_URL_FLAG} and the API key (${API_KEY_FLAG} or ${API_KEY_ENV})`;

/**
 * The message for the top-level error handlers. A gateway that refuses a
 * request answers with an HTML error page: ethers reports the status, flarejs
 * fails to parse the page as JSON. Both get a hint instead of the raw dump.
 */
export function describeError(error: unknown): string {
  if (error instanceof SubmittedTxError) {
    return `${error.context}: ${describeError(error.cause)}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const refused = /server response (40[13]) ([^(]*?)\s*(?:\(|$)/.exec(message);
  if (refused) {
    return `The node answered HTTP ${refused[1]} ${refused[2]}${NODE_HINT}`;
  }
  if (/Unexpected token '<'.*is not valid JSON/.test(message)) {
    return `The node answered with an error page instead of JSON-RPC (${message})${NODE_HINT}`;
  }
  return message;
}
