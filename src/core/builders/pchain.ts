/**
 * One builder per P-chain / atomic transaction type, over flarejs 5.2.0's
 * object-style builders. Builders only build; validation that needs chain
 * state (stake limits, validator existence, fork gates) lives in app/.
 */
import {
  TransferableOutput,
  evm,
  messageHashFromUnsignedTx,
  networkIDs,
  pvm,
  utils as futils,
  type UnsignedTx,
} from "@flarenetwork/flarejs";
import type { Account } from "../../chain/keys";
import { currentValidators } from "../../chain/validators";
import {
  chainOfAtomicTx,
  type AtomicTxType,
  type BuildPolicy,
  type Env,
  type TxRequestOf,
  type UnsignedTxBundle,
} from "../types";

const NFLR_PER_GWEI_DIVISOR = 1_000_000_000n;
const PRIMARY_NETWORK = networkIDs.PrimaryNetworkID.toString();

function bundle(txType: AtomicTxType, unsignedTx: UnsignedTx): UnsignedTxBundle {
  return {
    kind: "atomic",
    chain: chainOfAtomicTx(txType),
    txType,
    unsignedTx,
    digest: messageHashFromUnsignedTx(unsignedTx),
  };
}

/** Base fee in gwei (nFLR), rounded up, as the flarejs `*FromBaseFee` builders expect. */
const baseFeeGwei = (baseFeeWei: bigint): bigint => (baseFeeWei + NFLR_PER_GWEI_DIVISOR - 1n) / NFLR_PER_GWEI_DIVISOR;

/**
 * When the fee of exportCP/importPC is estimated (no `-f`), it covers this
 * multiple of the current base fee. Since Granite the Flare C-chain base fee
 * follows ACP-176 with `TargetToPriceUpdateConversion = 87`, which lets it at
 * most double in about 60 seconds, so twice the base fee still clears after a
 * minute between the estimate and the issue: reading the prompt, a Ledger
 * approval. An atomic transaction burns its whole fee (there is no refund as
 * with EIP-1559), so the headroom is paid: about 0.0056 FLR at the 500 gwei floor.
 */
export const ESTIMATED_FEE_BASE_FEE_MULTIPLIER = 2n;

/** The gas price (gwei = nFLR per gas) given to the flarejs `*FromBaseFee` builders. */
const estimatedGasPriceGwei = (baseFeeWei: bigint): bigint =>
  baseFeeGwei(baseFeeWei) * ESTIMATED_FEE_BASE_FEE_MULTIPLIER;

/**
 * The unsigned-file (ForDefi) policy needs `-f`: co-signers building the same
 * transaction must not each estimate a fee from the base fee of their moment.
 * Checked before any node call.
 */
function requireFeeForPolicy(type: "exportCP" | "importPC", fee: bigint | undefined, policy: BuildPolicy): void {
  if (fee === undefined && policy.requireExplicitFee) {
    throw new Error(`fee is required for ${type} transaction. Use --fee <fee> to specify the fee`);
  }
}

async function pChainInputs(env: Env, account: Account, policy: BuildPolicy, sourceChain?: "C") {
  const [context, feeState, { utxos }] = await Promise.all([
    env.clients.context(),
    env.clients.pvm.getFeeState(),
    env.clients.pvm.getUTXOs({ addresses: [account.pAddress], ...(sourceChain ? { sourceChain } : {}) }),
  ]);
  if (policy.feePrice !== "chain") {
    feeState.price = policy.feePrice;
  }
  return { context, feeState, utxos, from: [account.addressBytes] };
}

function startTime(requested: bigint | undefined, policy: BuildPolicy): bigint {
  if (requested !== undefined) return requested;
  return policy.defaultStartTime === "now" ? BigInt(Math.floor(Date.now() / 1000)) : policy.defaultStartTime;
}

export async function buildExportCP(
  req: TxRequestOf<"exportCP">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  requireFeeForPolicy("exportCP", req.fee, policy);
  const context = await env.clients.context();
  const nonce = req.nonce ?? BigInt(await env.clients.provider.getTransactionCount(account.cAddress));
  if (req.fee === undefined) {
    const baseFee = await env.clients.evm.getBaseFee();
    return bundle(
      "exportCP",
      evm.newExportTxFromBaseFee(
        context,
        estimatedGasPriceGwei(baseFee),
        req.amount,
        context.pBlockchainID,
        account.cAddressBytes,
        [account.addressBytes],
        nonce
      )
    );
  }
  return bundle(
    "exportCP",
    evm.newExportTx(
      context,
      req.amount,
      context.pBlockchainID,
      account.cAddressBytes,
      [account.addressBytes],
      req.fee,
      nonce
    )
  );
}

export async function buildImportCP(
  _req: TxRequestOf<"importCP">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy, "C");
  return bundle(
    "importCP",
    pvm.newImportTx(
      { feeState, utxos, fromAddressesBytes: from, sourceChainId: context.cBlockchainID, toAddressesBytes: from },
      context
    )
  );
}

export async function buildExportPC(
  req: TxRequestOf<"exportPC">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  let amount = req.amount;
  if (amount === undefined) {
    const { balance } = await env.clients.pvm.getBalance({ addresses: [account.pAddress] });
    amount = BigInt(balance) - context.baseTxFee;
    if (amount <= 0n) {
      throw new Error("Export amount is smaller than or equal to zero");
    }
  }
  return bundle(
    "exportPC",
    pvm.newExportTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        destinationChainId: context.cBlockchainID,
        outputs: [TransferableOutput.fromNative(context.avaxAssetID, amount, from)],
      },
      context
    )
  );
}

export async function buildImportPC(
  req: TxRequestOf<"importPC">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  requireFeeForPolicy("importPC", req.fee, policy);
  const [context, { utxos }] = await Promise.all([
    env.clients.context(),
    env.clients.evm.getUTXOs({ sourceChain: "P", addresses: [account.cAddressBech] }),
  ]);
  if (req.fee === undefined) {
    const baseFee = await env.clients.evm.getBaseFee();
    return bundle(
      "importPC",
      evm.newImportTxFromBaseFee(
        context,
        account.cAddressBytes,
        [account.addressBytes],
        utxos,
        context.pBlockchainID,
        estimatedGasPriceGwei(baseFee)
      )
    );
  }
  return bundle(
    "importPC",
    evm.newImportTx(context, account.cAddressBytes, [account.addressBytes], utxos, context.pBlockchainID, req.fee)
  );
}

export async function buildStake(
  req: TxRequestOf<"stake">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  return bundle(
    "stake",
    pvm.newAddPermissionlessValidatorTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        nodeId: req.nodeId,
        subnetId: PRIMARY_NETWORK,
        start: startTime(req.startTime, policy),
        end: req.endTime,
        weight: req.amount,
        shares: req.delegationFeeShares,
        publicKey: req.blsPublicKey,
        signature: req.blsSignature,
        rewardAddresses: from,
        delegatorRewardsOwner: from,
      },
      context
    )
  );
}

export async function buildDelegate(
  req: TxRequestOf<"delegate">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  return bundle(
    "delegate",
    pvm.newAddPermissionlessDelegatorTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        nodeId: req.nodeId,
        subnetId: PRIMARY_NETWORK,
        start: startTime(req.startTime, policy),
        end: req.endTime,
        weight: req.amount,
        rewardAddresses: from,
      },
      context
    )
  );
}

export async function buildTransfer(
  req: TxRequestOf<"transfer">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  return bundle(
    "transfer",
    pvm.newBaseTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        outputs: [TransferableOutput.fromNative(context.avaxAssetID, req.amount, [futils.bech32ToBytes(req.to)])],
      },
      context
    )
  );
}

export async function buildAddAutoRenewedValidator(
  req: TxRequestOf<"addAutoRenewedValidator">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  const owners =
    req.ownerAddresses && req.ownerAddresses.length > 0 ? req.ownerAddresses.map((a) => futils.bech32ToBytes(a)) : from;
  return bundle(
    "addAutoRenewedValidator",
    pvm.newAddAutoRenewedValidatorTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        nodeId: req.nodeId,
        publicKey: req.blsPublicKey,
        signature: req.blsSignature,
        weight: req.amount,
        shares: req.delegationFeeShares,
        period: req.period,
        autoCompoundRewardShares: req.autoCompoundShares ?? 0,
        rewardAddresses: from,
        delegatorRewardsOwner: from,
        ownerAddresses: owners,
      },
      context
    )
  );
}

/** Resolves the validator an auto-renew config change targets and the account's index in its authority. */
export async function resolveAutoRenewedValidator(
  req: Pick<TxRequestOf<"setAutoRenewedValidatorConfig">, "nodeId" | "validatorTxId">,
  env: Env,
  account: Account
): Promise<{ validatorTxId: string; authIndex: number; nodeId: string }> {
  const validators = await currentValidators(env, req.nodeId ? [req.nodeId] : undefined);
  const validator = validators.find((v) =>
    req.validatorTxId ? v.txID === req.validatorTxId : v.nodeID === req.nodeId
  );
  if (!validator) {
    throw new Error(`No current validator ${req.validatorTxId ?? req.nodeId ?? ""} on the network`);
  }
  if (!validator.validatorAuthority) {
    throw new Error(`Validator ${validator.nodeID} is not an auto-renewed validator`);
  }
  const authIndex = validator.validatorAuthority.addresses.findIndex(
    (a) => a.toLowerCase() === account.pAddress.toLowerCase()
  );
  if (authIndex < 0) {
    throw new Error(
      `The configured account ${account.pAddress} is not in the validator authority of ${validator.nodeID} (${validator.validatorAuthority.addresses.join(", ")})`
    );
  }
  return { validatorTxId: validator.txID, authIndex, nodeId: validator.nodeID };
}

export async function buildSetAutoRenewedValidatorConfig(
  req: TxRequestOf<"setAutoRenewedValidatorConfig">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const { validatorTxId, authIndex } = await resolveAutoRenewedValidator(req, env, account);
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  return bundle(
    "setAutoRenewedValidatorConfig",
    pvm.newSetAutoRenewedValidatorConfigTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        validatorTxId,
        auth: [authIndex],
        autoCompoundRewardShares: req.autoCompoundShares ?? 0,
        period: req.period,
      },
      context
    )
  );
}
