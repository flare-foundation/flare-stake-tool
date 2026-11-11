/**
 * What interactive mode shows before it signs a transaction: the account, the network, what the request asks for and
 * what the built transaction pays, moves and took from the chain (see core/details).
 */
import type { Account } from "../chain/keys";
import type { NetworkConfig } from "../chain/network";
import { SHARES_PER_PERCENT, formatDuration, formatFlr, formatWei, type NFlr, type Wei } from "../chain/units";
import type { BuiltDetails } from "../core/details";
import type { TxRequest } from "../core/types";

/** A unix time with its date, as the user can check it. */
const timeWithDate = (seconds: bigint): string => `${seconds} (${new Date(Number(seconds) * 1000).toISOString()})`;

/** The lines shown before signing `request`, whose built transaction has `details`. */
export function signingSummary(
  request: TxRequest,
  details: BuiltDetails,
  account: Account,
  network: Pick<NetworkConfig, "name" | "symbol">
): string[] {
  const flr = (amount: NFlr): string => `${formatFlr(amount)} ${network.symbol}`;
  const wei = (amount: Wei): string => `${formatWei(amount)} ${network.symbol}`;
  const percent = (shares: number): string => `${shares / SHARES_PER_PERCENT}%`;
  const lines: [string, string | undefined][] = [["Account", `${account.cAddress} / ${account.pAddress}`]];
  switch (request.type) {
    case "exportCP":
      lines.push(["Amount", `${flr(request.amount)} from the C-chain to the P-chain`]);
      break;
    case "exportPC":
      lines.push([
        "Amount",
        `${request.amount === undefined ? "the spendable balance" : flr(request.amount)} from the P-chain to the C-chain`,
      ]);
      break;
    case "importCP":
    case "importPC":
      lines.push([
        "Amount",
        details.imported === undefined
          ? undefined
          : `${flr(details.imported)} to the ${request.type === "importCP" ? "P" : "C"}-chain`,
      ]);
      break;
    case "stake":
    case "delegate":
      lines.push(
        ["Amount", flr(request.amount)],
        ["Node", request.nodeId],
        ["End time", timeWithDate(request.endTime)]
      );
      if (request.type === "stake") lines.push(["Delegation fee", percent(request.delegationFeeShares)]);
      break;
    case "transfer":
      lines.push(["Amount", flr(request.amount)], ["To", request.to]);
      break;
    case "addAutoRenewedValidator":
      lines.push(
        ["Amount", flr(request.amount)],
        ["Node", request.nodeId],
        ["Period", `${formatDuration(request.period)} (${request.period} s)`],
        ["Delegation fee", percent(request.delegationFeeShares)]
      );
      break;
    case "setAutoRenewedValidatorConfig":
      lines.push(
        ["Node", request.nodeId ?? request.validatorTxId],
        [
          "Period",
          request.period === 0n
            ? "0: auto-renewal stops at the end of the current cycle"
            : `${formatDuration(request.period)} (${request.period} s) from the next cycle`,
        ]
      );
      break;
    case "claim":
      lines.push(
        ["Amount", details.claimed === undefined ? undefined : wei(details.claimed)],
        ["Recipient", request.recipient],
        ["Wrapped", request.wrap ? "yes" : "no"]
      );
      break;
    case "withdrawal":
      lines.push(["Amount", wei(request.amount)], ["To", request.to]);
      break;
    case "setClaimExecutors":
      lines.push(["Executors", request.executors.join(", ") || "none (clears the list)"]);
      lines.push(["Executor fees", details.value === undefined ? undefined : wei(details.value)]);
      break;
    case "setAllowedClaimRecipients":
      lines.push(["Recipients", request.recipients.join(", ") || "none (clears the list)"]);
      break;
    case "customCChainTx":
      lines.push(["To", request.to], ["Value", wei(request.value)], ["Data", request.data]);
      break;
  }
  if (details.fee !== undefined) lines.push(["Fee", flr(details.fee)]);
  if (details.nonce !== undefined) lines.push(["Nonce", String(details.nonce)]);
  if (details.maxGasCost !== undefined) lines.push(["Gas", `at most ${wei(details.maxGasCost)}`]);
  return [
    `About to sign ${request.type} on ${network.name}:`,
    ...lines
      .filter((line): line is [string, string] => line[1] !== undefined)
      .map(([name, value]) => `  ${name}: ${value}`),
  ];
}
