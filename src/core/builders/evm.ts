/** C-chain EVM transactions: the reward contracts and plain transfers. The rawTx shape is the frozen file format. */
import { Transaction, formatUnits, getAddress, getBytes, type TransactionLike } from "ethers";
import {
  contractAddress,
  contractInterface,
  executorInfo,
  hasContractCode,
  stateOfRewards,
} from "../../chain/contracts";
import type { Account } from "../../chain/keys";
import { defaultGasLimit, normalizeAddressList, type EvmFees } from "../../constants/fees";
import type { BuildPolicy, EvmEnv, EvmTxType, TxRequestOf, UnsignedTxBundle } from "../types";

function evmBundle(txType: EvmTxType, rawTx: TransactionLike): UnsignedTxBundle {
  // Build exactly what gets signed. The builders always set the type (2, EIP-1559 fees); without one ethers would
  // infer EIP-2930. Type-less files written by versions before 4.4.0 never come through here: `send` reloads them
  // with bundleFromUnsignedTxJson, which keeps the envelope they were signed over.
  const tx = Transaction.from({ ...rawTx, type: rawTx.type ?? 2 });
  return { kind: "evm", txType, tx, rawTx, digest: getBytes(tx.unsignedHash) };
}

async function nonceOf(
  env: EvmEnv,
  account: Account,
  requested: number | undefined,
  policy: BuildPolicy
): Promise<number> {
  return requested ?? (await env.clients.provider.getTransactionCount(account.cAddress, policy.evmNonce));
}

/** The fee fields, with `gasLimit` being `--gas-limit` or else the operation's default. */
function feeFields(
  fees: EvmFees,
  defaultLimit: number
): Pick<TransactionLike, "type" | "maxFeePerGas" | "maxPriorityFeePerGas" | "gasLimit"> {
  return {
    type: fees.type,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit: fees.gasLimit ?? defaultLimit,
  };
}

/** Whether the recipient has contract code; asked only when the default gas limit depends on it. */
async function contractRecipient(env: EvmEnv, fees: EvmFees, recipient: string): Promise<boolean> {
  return fees.gasLimit === undefined && (await hasContractCode(env, recipient));
}

export async function buildWithdrawal(
  req: TxRequestOf<"withdrawal">,
  env: EvmEnv,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const nonce = await nonceOf(env, account, req.nonce, policy);
  const to = getAddress(req.to);
  const contract = await contractRecipient(env, req.fees, to);
  return evmBundle("withdrawal", {
    nonce,
    ...feeFields(req.fees, defaultGasLimit("withdrawal", { contractRecipient: contract })),
    to,
    value: req.amount.toString(),
    chainId: env.network.chainId,
  });
}

export async function buildClaim(
  req: TxRequestOf<"claim">,
  env: EvmEnv,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const recipient = getAddress(req.recipient);
  const rewardManager = await contractAddress(env, "ValidatorRewardManager");
  const nonce = await nonceOf(env, account, req.nonce, policy);
  const rewards = await stateOfRewards(env, rewardManager, account.cAddress);
  const amountWei = req.amount ?? rewards.unclaimedWei;
  if (amountWei > rewards.unclaimedWei || rewards.unclaimedWei === 0n || amountWei === 0n) {
    const symbol = env.network.symbol;
    throw new Error(
      `Trying to claim: ${formatUnits(amountWei, 18)} ${symbol}. Unclaimed rewards: ${formatUnits(rewards.unclaimedWei, 18)} ${symbol}. ` +
        "Amount should be greater than 0 and less than or equal to unclaimed rewards."
    );
  }
  const contract = !req.wrap && (await contractRecipient(env, req.fees, recipient));
  return evmBundle("claim", {
    nonce,
    ...feeFields(req.fees, defaultGasLimit("claim", { wrap: req.wrap, contractRecipient: contract })),
    to: rewardManager,
    data: contractInterface.encodeFunctionData("claim", [account.cAddress, recipient, amountWei, req.wrap]),
    chainId: env.network.chainId,
  });
}

export async function buildSetClaimExecutors(
  req: TxRequestOf<"setClaimExecutors">,
  env: EvmEnv,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const claimSetupManager = await contractAddress(env, "ClaimSetupManager");
  const nonce = await nonceOf(env, account, req.nonce, policy);
  const executors = normalizeAddressList(req.executors);
  let totalFeeWei = 0n;
  for (const executor of executors) {
    const info = await executorInfo(env, claimSetupManager, getAddress(executor));
    if (!info.registered) {
      throw new Error(`Executor ${executor} is not registered`);
    }
    totalFeeWei += info.feeWei;
  }
  return evmBundle("setClaimExecutors", {
    nonce,
    ...feeFields(req.fees, defaultGasLimit("setClaimExecutors", { entries: executors.length })),
    to: claimSetupManager,
    data: contractInterface.encodeFunctionData("setClaimExecutors", [executors]),
    chainId: env.network.chainId,
    value: totalFeeWei.toString(),
  });
}

export async function buildSetAllowedClaimRecipients(
  req: TxRequestOf<"setAllowedClaimRecipients">,
  env: EvmEnv,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const claimSetupManager = await contractAddress(env, "ClaimSetupManager");
  const nonce = await nonceOf(env, account, req.nonce, policy);
  const recipients = normalizeAddressList(req.recipients);
  return evmBundle("setAllowedClaimRecipients", {
    nonce,
    ...feeFields(req.fees, defaultGasLimit("setAllowedClaimRecipients", { entries: recipients.length })),
    to: claimSetupManager,
    data: contractInterface.encodeFunctionData("setAllowedClaimRecipients", [recipients]),
    chainId: env.network.chainId,
  });
}

export async function buildCustomCChainTx(
  req: TxRequestOf<"customCChainTx">,
  env: EvmEnv,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const nonce = await nonceOf(env, account, req.nonce, policy);
  return evmBundle("customCChainTx", {
    nonce,
    ...feeFields(req.fees, defaultGasLimit("custom")),
    to: getAddress(req.to),
    value: req.value.toString(),
    data: req.data,
    chainId: env.network.chainId,
  });
}
