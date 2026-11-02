/** C-chain EVM transactions: the reward contracts and plain transfers. The rawTx shape is the frozen file format. */
import { Transaction, formatUnits, getAddress, getBytes, type TransactionLike } from "ethers";
import { contractAddress, contractInterface, executorInfo, stateOfRewards } from "../../chain/contracts";
import type { Account } from "../../chain/keys";
import { normalizeAddressList, type EvmFees } from "../../constants/fees";
import type { Env, EvmTxType, TxRequestOf, UnsignedTxBundle } from "../types";

function evmBundle(txType: EvmTxType, rawTx: TransactionLike): UnsignedTxBundle {
  // Build exactly what gets signed. The builders always set the type (2, EIP-1559 fees); without one ethers would
  // infer EIP-2930. Type-less files written by versions before 4.4.0 never come through here: `send` reloads them
  // with bundleFromUnsignedTxJson, which keeps the envelope they were signed over.
  const tx = Transaction.from({ ...rawTx, type: rawTx.type ?? 2 });
  return { kind: "evm", txType, tx, rawTx, digest: getBytes(tx.unsignedHash) };
}

async function nonceOf(env: Env, account: Account, requested: number | undefined): Promise<number> {
  return requested ?? (await env.clients.provider.getTransactionCount(account.cAddress));
}

function feeFields(
  fees: EvmFees
): Pick<TransactionLike, "type" | "maxFeePerGas" | "maxPriorityFeePerGas" | "gasLimit"> {
  return {
    type: fees.type,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit: fees.gasLimit,
  };
}

export async function buildWithdrawal(
  req: TxRequestOf<"withdrawal">,
  env: Env,
  account: Account
): Promise<UnsignedTxBundle> {
  const nonce = await nonceOf(env, account, req.nonce);
  return evmBundle("withdrawal", {
    nonce,
    ...feeFields(req.fees),
    to: getAddress(req.to),
    value: req.amount.toString(),
    chainId: env.network.chainId,
  });
}

export async function buildClaim(req: TxRequestOf<"claim">, env: Env, account: Account): Promise<UnsignedTxBundle> {
  const recipient = getAddress(req.recipient);
  const rewardManager = await contractAddress(env, "ValidatorRewardManager");
  const nonce = await nonceOf(env, account, req.nonce);
  const rewards = await stateOfRewards(env, rewardManager, account.cAddress);
  const amountWei = req.amount ?? rewards.unclaimedWei;
  if (amountWei > rewards.unclaimedWei || rewards.unclaimedWei === 0n || amountWei === 0n) {
    const symbol = env.network.symbol;
    throw new Error(
      `Trying to claim: ${formatUnits(amountWei, 18)} ${symbol}. Unclaimed rewards: ${formatUnits(rewards.unclaimedWei, 18)} ${symbol}. ` +
        "Amount should be greater than 0 and less than or equal to unclaimed rewards."
    );
  }
  return evmBundle("claim", {
    nonce,
    ...feeFields(req.fees),
    to: rewardManager,
    data: contractInterface.encodeFunctionData("claim", [account.cAddress, recipient, amountWei, req.wrap]),
    chainId: env.network.chainId,
  });
}

export async function buildSetClaimExecutors(
  req: TxRequestOf<"setClaimExecutors">,
  env: Env,
  account: Account
): Promise<UnsignedTxBundle> {
  const claimSetupManager = await contractAddress(env, "ClaimSetupManager");
  const nonce = await nonceOf(env, account, req.nonce);
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
    ...feeFields(req.fees),
    to: claimSetupManager,
    data: contractInterface.encodeFunctionData("setClaimExecutors", [executors]),
    chainId: env.network.chainId,
    value: totalFeeWei.toString(),
  });
}

export async function buildSetAllowedClaimRecipients(
  req: TxRequestOf<"setAllowedClaimRecipients">,
  env: Env,
  account: Account
): Promise<UnsignedTxBundle> {
  const claimSetupManager = await contractAddress(env, "ClaimSetupManager");
  const nonce = await nonceOf(env, account, req.nonce);
  const recipients = normalizeAddressList(req.recipients);
  return evmBundle("setAllowedClaimRecipients", {
    nonce,
    ...feeFields(req.fees),
    to: claimSetupManager,
    data: contractInterface.encodeFunctionData("setAllowedClaimRecipients", [recipients]),
    chainId: env.network.chainId,
  });
}

export async function buildCustomCChainTx(
  req: TxRequestOf<"customCChainTx">,
  env: Env,
  account: Account
): Promise<UnsignedTxBundle> {
  const nonce = await nonceOf(env, account, req.nonce);
  return evmBundle("customCChainTx", {
    nonce,
    ...feeFields(req.fees),
    to: getAddress(req.to),
    value: req.value.toString(),
    data: req.data,
    chainId: env.network.chainId,
  });
}
