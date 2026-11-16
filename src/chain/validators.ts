/** Typed `platform.getCurrentValidators`, including the Helicon (ACP-236) fields. */
import type { Env } from "../core/types";
import { asNFlr, type NFlr } from "./units";

export interface OutputOwners {
  locktime: string;
  threshold: string;
  addresses: string[];
}

export interface CurrentDelegator {
  txID: string;
  startTime: string;
  endTime: string;
  stakeAmount?: string;
  weight?: string;
  nodeID: string;
  rewardOwner?: OutputOwners;
  delegationRewardOwner?: OutputOwners;
  potentialReward?: string;
}

export interface CurrentValidator {
  txID: string;
  startTime: string;
  /** For an auto-renewed validator: the end of the current cycle. */
  endTime: string;
  stakeAmount?: string;
  weight?: string;
  nodeID: string;
  rewardOwner?: OutputOwners;
  validationRewardOwner?: OutputOwners;
  delegationRewardOwner?: OutputOwners;
  delegationFee?: string;
  uptime?: string;
  connected?: boolean;
  /** How many delegations the validator has; `delegators` lists them unless the node leaves the list out. */
  delegatorCount?: string;
  delegators?: CurrentDelegator[];
  /** Present only for auto-renewed validators (Helicon). */
  validatorAuthority?: OutputOwners;
  nextPeriod?: string;
  autoCompoundRewardShares?: string;
  [key: string]: unknown;
}

export async function currentValidators(env: Env, nodeIDs?: string[]): Promise<CurrentValidator[]> {
  const response = (await env.clients.pvm.getCurrentValidators(nodeIDs ? { nodeIDs } : undefined)) as unknown as {
    validators: CurrentValidator[];
  };
  return response.validators;
}

export const isAutoRenewed = (validator: CurrentValidator): boolean => validator.validatorAuthority !== undefined;

export interface Stake {
  txId: string;
  kind: "validator" | "delegator";
  nodeId: string;
  /** P-chain addresses of the reward owner, usually one. */
  owners: string[];
  startTime: bigint;
  /** For an auto-renewed validator: the end of the current cycle. */
  endTime: bigint;
  amount: NFlr;
  /** An auto-renewed validator (Helicon); delegations are never. */
  autoRenewed: boolean;
}

/** The reward owner's addresses: of the Helicon-era field when it lists any, else of the older one. */
const ownersOf = (current: OutputOwners | undefined, older: OutputOwners | undefined): string[] =>
  current?.addresses.length ? current.addresses : (older?.addresses ?? []);
const amountOf = (stake: { stakeAmount?: string; weight?: string }): NFlr =>
  asNFlr(BigInt(stake.stakeAmount ?? stake.weight ?? "0"));

/**
 * Every current stake (validation or delegation) of `pAddress`: those whose first reward owner it is (`first`, what
 * the limit of staked nodes counts: the stake mirror counts a stake for the address that paid for it, which the list
 * doesn't show, and every stake this tool builds rewards that address alone), or those whose reward owners include
 * it (`any`, what `info stakes` lists).
 */
export function stakesOf(validators: CurrentValidator[], pAddress: string, match: "first" | "any" = "first"): Stake[] {
  const wanted = pAddress.toLowerCase();
  const isWanted = (owners: string[]): boolean =>
    match === "first"
      ? owners[0]?.toLowerCase() === wanted
      : owners.some((address) => address.toLowerCase() === wanted);
  const stakes: Stake[] = [];
  for (const validator of validators) {
    const owners = ownersOf(validator.validationRewardOwner, validator.rewardOwner);
    if (isWanted(owners)) {
      stakes.push({
        txId: validator.txID,
        kind: "validator",
        nodeId: validator.nodeID,
        owners,
        startTime: BigInt(validator.startTime),
        endTime: BigInt(validator.endTime),
        amount: amountOf(validator),
        autoRenewed: isAutoRenewed(validator),
      });
    }
    for (const delegator of validator.delegators ?? []) {
      const delegationOwners = ownersOf(delegator.delegationRewardOwner, delegator.rewardOwner);
      if (isWanted(delegationOwners)) {
        stakes.push({
          txId: delegator.txID,
          kind: "delegator",
          nodeId: validator.nodeID,
          owners: delegationOwners,
          startTime: BigInt(delegator.startTime),
          endTime: BigInt(delegator.endTime),
          amount: amountOf(delegator),
          autoRenewed: false,
        });
      }
    }
  }
  return stakes;
}
