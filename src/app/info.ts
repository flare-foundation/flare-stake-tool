import type { Account } from "../chain/keys";
import { asNFlr, asWei, type NFlr, type Wei } from "../chain/units";
import { currentValidators, isAutoRenewed, type CurrentValidator } from "../chain/validators";
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
  const compound = validator.autoCompoundRewardShares ? Number(validator.autoCompoundRewardShares) / 10_000 : 0;
  return `auto-renewed: cycle ends ${cycleEnd}, next period ${nextPeriod}s${nextPeriod === "0" ? " (exits at cycle end)" : ""}, authority ${authority}, auto-compound ${compound}%`;
}
