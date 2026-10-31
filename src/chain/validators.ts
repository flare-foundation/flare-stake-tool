/** Typed `platform.getCurrentValidators`, including the Helicon (ACP-236) fields. */
import type { Env } from "../core/types";

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
  /** P-chain address of the reward owner. */
  owner: string;
  startTime: bigint;
  endTime: bigint;
  amount: bigint;
}

const ownerOf = (owners: OutputOwners | undefined): string | undefined => owners?.addresses[0];
const amountOf = (stake: { stakeAmount?: string; weight?: string }): bigint =>
  BigInt(stake.stakeAmount ?? stake.weight ?? "0");

/** Every current stake (validation or delegation) whose reward owner is `pAddress`. */
export function stakesOf(validators: CurrentValidator[], pAddress: string): Stake[] {
  const wanted = pAddress.toLowerCase();
  const stakes: Stake[] = [];
  for (const validator of validators) {
    const owner = ownerOf(validator.validationRewardOwner) ?? ownerOf(validator.rewardOwner);
    if (owner?.toLowerCase() === wanted) {
      stakes.push({
        txId: validator.txID,
        kind: "validator",
        nodeId: validator.nodeID,
        owner,
        startTime: BigInt(validator.startTime),
        endTime: BigInt(validator.endTime),
        amount: amountOf(validator),
      });
    }
    for (const delegator of validator.delegators ?? []) {
      const delegationOwner = ownerOf(delegator.delegationRewardOwner) ?? ownerOf(delegator.rewardOwner);
      if (delegationOwner?.toLowerCase() === wanted) {
        stakes.push({
          txId: delegator.txID,
          kind: "delegator",
          nodeId: validator.nodeID,
          owner: delegationOwner,
          startTime: BigInt(delegator.startTime),
          endTime: BigInt(delegator.endTime),
          amount: amountOf(delegator),
        });
      }
    }
  }
  return stakes;
}
