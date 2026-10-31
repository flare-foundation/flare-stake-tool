import { styleText } from "node:util";
import { API_KEY_ENV } from "./chain/network";
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

const NODE_HINT = `; check ${RPC_URL_FLAG} and the API key (${API_KEY_FLAG} or ${API_KEY_ENV})`;

/**
 * The message for the top-level error handlers. A gateway that refuses a
 * request answers with an HTML error page: ethers reports the status, flarejs
 * fails to parse the page as JSON. Both get a hint instead of the raw dump.
 */
export function describeError(error: unknown): string {
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
