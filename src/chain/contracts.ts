/** The C-chain contracts the tool talks to, via ethers over six ABI fragments. */
import { Interface, ZeroAddress, getAddress } from "ethers";
import type { Env } from "../core/types";

export const FLARE_CONTRACT_REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

export const CONTRACT_FRAGMENTS = [
  "function getContractAddressByName(string _name) view returns (address)",
  "function getStateOfRewards(address _beneficiary) view returns (uint256 _totalReward, uint256 _claimedReward)",
  "function claim(address _rewardOwner, address _recipient, uint256 _rewardAmount, bool _wrap)",
  "function getExecutorInfo(address _executor) view returns (bool _registered, uint256 _currentFeeValue)",
  "function setClaimExecutors(address[] _executors) payable",
  "function setAllowedClaimRecipients(address[] _recipients)",
] as const;

export const contractInterface = new Interface([...CONTRACT_FRAGMENTS]);

export type RegisteredContract = "ValidatorRewardManager" | "ClaimSetupManager";

async function call(env: Env, to: string, fn: string, args: unknown[]): Promise<ReadonlyArray<unknown>> {
  const data = contractInterface.encodeFunctionData(fn, args);
  const result = await env.clients.provider.call({ to, data });
  return contractInterface.decodeFunctionResult(fn, result);
}

/** Looks a contract up in the FlareContractRegistry; throws when it is not deployed on this network. */
export async function contractAddress(env: Env, name: RegisteredContract): Promise<string> {
  const [address] = await call(env, FLARE_CONTRACT_REGISTRY_ADDRESS, "getContractAddressByName", [name]);
  if (typeof address !== "string" || address === ZeroAddress) {
    throw new Error(`${name} contract address not found`);
  }
  return getAddress(address);
}

/**
 * Whether the address has contract code, such as a smart contract wallet or a
 * Personal Delegation Account; such a recipient runs code when it receives FLR.
 */
export async function hasContractCode(env: Env, address: string): Promise<boolean> {
  return (await env.clients.provider.getCode(address)) !== "0x";
}

export interface RewardState {
  totalWei: bigint;
  claimedWei: bigint;
  unclaimedWei: bigint;
}

export async function stateOfRewards(env: Env, rewardManager: string, owner: string): Promise<RewardState> {
  const [total, claimed] = await call(env, rewardManager, "getStateOfRewards", [owner]);
  const totalWei = BigInt(total as bigint);
  const claimedWei = BigInt(claimed as bigint);
  return { totalWei, claimedWei, unclaimedWei: totalWei - claimedWei };
}

export async function executorInfo(
  env: Env,
  claimSetupManager: string,
  executor: string
): Promise<{ registered: boolean; feeWei: bigint }> {
  const [registered, fee] = await call(env, claimSetupManager, "getExecutorInfo", [executor]);
  return { registered: Boolean(registered), feeWei: BigInt(fee as bigint) };
}
