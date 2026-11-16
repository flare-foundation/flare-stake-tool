import type { Account } from "../chain/keys";
import type { NetworkConfig } from "../chain/network";
import { SHARES_PER_PERCENT, asNFlr, asWei, formatFlr, formatWei, type NFlr, type Wei } from "../chain/units";
import { currentValidators, isAutoRenewed, stakesOf, type CurrentValidator, type Stake } from "../chain/validators";
import type { Env } from "../core/types";

export interface Balances {
  cChainWei: Wei;
  pChainNFlr: NFlr;
}

export async function getBalances(env: Env, account: Account): Promise<Balances> {
  await env.clients.verifyNetwork();
  const [cChainWei, pBalance] = await Promise.all([
    env.clients.provider.getBalance(account.cAddress),
    env.clients.pvm.getBalance({ addresses: [account.pAddress] }),
  ]);
  return { cChainWei: asWei(cChainWei), pChainNFlr: asNFlr(BigInt(pBalance.balance)) };
}

export async function getValidators(env: Env): Promise<CurrentValidator[]> {
  await env.clients.verifyNetwork();
  return currentValidators(env);
}

/** One-line summary of an auto-renewed validator's configuration. */
export function describeAutoRenewal(validator: CurrentValidator): string | undefined {
  if (!isAutoRenewed(validator)) return undefined;
  const cycleEnd = new Date(Number(validator.endTime) * 1000).toISOString();
  const nextPeriod = validator.nextPeriod ?? "?";
  const authority = validator.validatorAuthority?.addresses.join(", ") ?? "?";
  const compound = validator.autoCompoundRewardShares
    ? Number(validator.autoCompoundRewardShares) / SHARES_PER_PERCENT
    : 0;
  return `auto-renewed: cycle ends ${cycleEnd}, next period ${nextPeriod}s${nextPeriod === "0" ? " (exits at cycle end)" : ""}, authority ${authority}, auto-compound ${compound}%`;
}

/** An account's current stakes: validations and delegations whose reward owners include it. */
export interface StakesReport {
  /** By end time, then node id and transaction id. */
  stakes: Stake[];
  /** Distinct nodes among them. */
  nodes: number;
  total: NFlr;
  /** Validators whose delegations the node counts but doesn't list in full: some of the account's may be missing. */
  unlisted: { nodeId: string; listed: number; count: string }[];
}

export async function getStakes(env: Env, account: Account): Promise<StakesReport> {
  await env.clients.verifyNetwork();
  return stakesReport(await currentValidators(env), account.pAddress);
}

export function stakesReport(validators: CurrentValidator[], pAddress: string): StakesReport {
  const stakes = stakesOf(validators, pAddress, "any").sort(
    (a, b) =>
      (a.endTime < b.endTime ? -1 : a.endTime > b.endTime ? 1 : 0) ||
      (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0) ||
      (a.txId < b.txId ? -1 : a.txId > b.txId ? 1 : 0)
  );
  const unlisted = validators
    .filter((v) => BigInt(v.delegatorCount ?? "0") > BigInt(v.delegators?.length ?? 0))
    .map((v) => ({ nodeId: v.nodeID, listed: v.delegators?.length ?? 0, count: v.delegatorCount ?? "0" }));
  return {
    stakes,
    nodes: new Set(stakes.map((stake) => stake.nodeId.toLowerCase())).size,
    total: asNFlr(stakes.reduce((sum, stake) => sum + stake.amount, 0n)),
    unlisted,
  };
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;
const timeOf = (seconds: bigint): string => `${new Date(Number(seconds) * 1000).toISOString()} (${seconds})`;

/** What `info stakes` and the interactive menu print: a summary line, a line per stake and the total. */
export function describeStakes(report: StakesReport, pAddress: string, network: NetworkConfig): string[] {
  const limit =
    network.maxStakedNodes === undefined
      ? `no limit of nodes on ${network.name}`
      : `at most ${network.maxStakedNodes} nodes at once on ${network.name}`;
  const count =
    report.stakes.length === 0
      ? "no stakes"
      : `${plural(report.stakes.length, "stake")} on ${plural(report.nodes, "node")}`;
  return [
    `${pAddress}: ${count} (${limit})`,
    ...report.stakes.map(
      (stake) =>
        `${stake.kind === "validator" ? "validation" : "delegation"} ${stake.nodeId} ` +
        `${formatFlr(stake.amount)} ${network.symbol}, ` +
        (stake.autoRenewed ? `auto-renewed, cycle ends ${timeOf(stake.endTime)}` : `ends ${timeOf(stake.endTime)}`) +
        `, tx ${stake.txId}` +
        (stake.owners.length > 1 ? `, reward owners ${stake.owners.join(", ")}` : "")
    ),
    `Total staked: ${formatFlr(report.total)} ${network.symbol}`,
  ];
}

/** The warning for a validator whose delegations the node doesn't list in full. */
export const unlistedDelegationsWarning = (entry: StakesReport["unlisted"][number]): string =>
  `The node lists ${entry.listed} of the ${entry.count} delegations to ${entry.nodeId}, so some of the account's ` +
  "stakes there may be missing; use a node that lists them (--rpc-url)";

/*
 * What `info <type> --json` prints, for scripts: amounts as exact strings, both in the coin (as the text output
 * prints them) and as the integer of its base unit (nFLR on the P-chain, wei on the C-chain); times in unix seconds.
 */

export function addressesJson(account: Account, network: NetworkConfig) {
  return {
    network: network.name,
    pChainAddress: account.pAddress,
    cChainAddress: account.cAddress,
    publicKey: `0x${account.publicKeyHex}`,
  };
}

export function balancesJson(balances: Balances, account: Account, network: NetworkConfig) {
  return {
    network: network.name,
    symbol: network.symbol,
    cChain: { address: account.cAddress, balance: formatWei(balances.cChainWei), wei: balances.cChainWei.toString() },
    pChain: {
      address: account.pAddress,
      balance: formatFlr(balances.pChainNFlr),
      nFlr: balances.pChainNFlr.toString(),
    },
  };
}

export function stakesJson(report: StakesReport, pAddress: string, network: NetworkConfig) {
  return {
    network: network.name,
    symbol: network.symbol,
    pChainAddress: pAddress,
    /** The most distinct nodes an account may stake to at once on this network; null where nothing limits it. */
    nodeLimit: network.maxStakedNodes ?? null,
    nodes: report.nodes,
    total: formatFlr(report.total),
    totalNFlr: report.total.toString(),
    stakes: report.stakes.map((stake) => ({
      kind: stake.kind === "validator" ? "validation" : "delegation",
      nodeId: stake.nodeId,
      amount: formatFlr(stake.amount),
      amountNFlr: stake.amount.toString(),
      startTime: Number(stake.startTime),
      /** For an auto-renewed validator: the end of its current cycle. */
      endTime: Number(stake.endTime),
      autoRenewed: stake.autoRenewed,
      txId: stake.txId,
      rewardOwners: stake.owners,
    })),
  };
}
