/**
 * Synthesized `eth_call` answers for the reward contracts, which do not exist
 * on localflare: FlareContractRegistry.getContractAddressByName,
 * ValidatorRewardManager.getStateOfRewards and ClaimSetupManager.getExecutorInfo.
 * Matching is by target address + function selector, so it is independent of
 * how the EVM client shapes the rest of the call object.
 */
import { id as keccakId } from "ethers";
import { FLARE_CONTRACT_REGISTRY_ADDRESS } from "../../src/chain/contracts";
import type { Stub } from "./rpc-replay";

export const STUB_VALIDATOR_REWARD_MANAGER = "0x1111111111111111111111111111111111111111";
export const STUB_CLAIM_SETUP_MANAGER = "0x2222222222222222222222222222222222222222";
/** 5 FLR total, 1 FLR claimed → 4 FLR unclaimed. */
export const STUB_TOTAL_REWARDS_WEI = 5_000_000_000_000_000_000n;
export const STUB_CLAIMED_REWARDS_WEI = 1_000_000_000_000_000_000n;
/** Executor registration fee charged per executor by the stubbed ClaimSetupManager. */
export const STUB_EXECUTOR_FEE_WEI = 100_000_000_000_000_000n;

const selector = (signature: string): string => keccakId(signature).slice(0, 10);
const SEL_GET_CONTRACT_ADDRESS_BY_NAME = selector("getContractAddressByName(string)");
const SEL_GET_STATE_OF_REWARDS = selector("getStateOfRewards(address)");
const SEL_GET_EXECUTOR_INFO = selector("getExecutorInfo(address)");

const word = (value: bigint | boolean): string =>
  (typeof value === "boolean" ? (value ? 1n : 0n) : value).toString(16).padStart(64, "0");
const addressWord = (address: string): string => address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

interface CallObject {
  to?: string;
  data?: string;
  input?: string;
}

function callOf(params: unknown): { to: string; data: string } | undefined {
  if (!Array.isArray(params) || typeof params[0] !== "object" || params[0] === null) return undefined;
  const call = params[0] as CallObject;
  const data = call.data ?? call.input;
  if (!call.to || !data) return undefined;
  return { to: call.to.toLowerCase(), data: data.toLowerCase() };
}

function matchCall(address: string, sel: string) {
  return (reqPath: string, method: string, params: unknown): boolean => {
    if (method !== "eth_call") return false;
    const call = callOf(params);
    return !!call && call.to === address.toLowerCase() && call.data.startsWith(sel);
  };
}

/** Decodes the single `string` argument of getContractAddressByName(string). */
function contractNameOf(params: unknown): string {
  const call = callOf(params);
  if (!call) return "";
  const args = call.data.slice(10);
  const offset = Number(BigInt("0x" + args.slice(0, 64))) * 2;
  const length = Number(BigInt("0x" + args.slice(offset, offset + 64)));
  return Buffer.from(args.slice(offset + 64, offset + 64 + length * 2), "hex").toString("utf8");
}

export const evmContractStubs: Stub[] = [
  {
    match: matchCall(FLARE_CONTRACT_REGISTRY_ADDRESS, SEL_GET_CONTRACT_ADDRESS_BY_NAME),
    respond: (params) => {
      const name = contractNameOf(params);
      const address =
        name === "ValidatorRewardManager"
          ? STUB_VALIDATOR_REWARD_MANAGER
          : name === "ClaimSetupManager"
            ? STUB_CLAIM_SETUP_MANAGER
            : "0x0000000000000000000000000000000000000000";
      return "0x" + addressWord(address);
    },
  },
  {
    match: matchCall(STUB_VALIDATOR_REWARD_MANAGER, SEL_GET_STATE_OF_REWARDS),
    respond: () => "0x" + word(STUB_TOTAL_REWARDS_WEI) + word(STUB_CLAIMED_REWARDS_WEI),
  },
  {
    match: matchCall(STUB_CLAIM_SETUP_MANAGER, SEL_GET_EXECUTOR_INFO),
    respond: () => "0x" + word(true) + word(STUB_EXECUTOR_FEE_WEI),
  },
];
