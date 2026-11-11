/**
 * One builder per P-chain / atomic transaction type, over flarejs'
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
import { pChainAddressBytes, type Account } from "../../chain/keys";
import { formatFlr } from "../../chain/units";
import { currentValidators } from "../../chain/validators";
import { atomicTxFee } from "../fee";
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

/** The node's page size for getUTXOs; a shorter page is the last one. */
export const UTXO_PAGE_SIZE = 1024;

type UtxoPage = Awaited<ReturnType<pvm.PVMApi["getUTXOs"]>>;
type UtxoQuery = Parameters<pvm.PVMApi["getUTXOs"]>[0];

/**
 * Every UTXO of the query, following the node's pagination (`endIndex` as the
 * next `startIndex`); a single call stops at 1024. The first request is the
 * plain query, so an account with fewer UTXOs makes one call, identical to an
 * unpaginated lookup. A UTXO repeated at a page boundary is kept once.
 */
export async function allUtxos(getPage: (query: UtxoQuery) => Promise<UtxoPage>, query: UtxoQuery) {
  const utxos: UtxoPage["utxos"] = [];
  const seen = new Set<string>();
  let page = await getPage(query);
  for (;;) {
    for (const utxo of page.utxos) {
      const id = utxo.ID();
      if (!seen.has(id)) {
        seen.add(id);
        utxos.push(utxo);
      }
    }
    if (Number(page.numFetched) < UTXO_PAGE_SIZE || page.utxos.length === 0) {
      return utxos;
    }
    page = await getPage({ ...query, startIndex: page.endIndex });
  }
}

async function pChainInputs(env: Env, account: Account, policy: BuildPolicy, sourceChain?: "C") {
  const [context, feeState, utxos] = await Promise.all([
    env.clients.context(),
    env.clients.pvm.getFeeState(),
    allUtxos((query) => env.clients.pvm.getUTXOs(query), {
      addresses: [account.pAddress],
      ...(sourceChain ? { sourceChain } : {}),
    }),
  ]);
  if (policy.feePrice !== "chain") {
    feeState.price = policy.feePrice;
  }
  return { context, feeState, utxos, from: [account.addressBytes] };
}

type PChainInputs = Awaited<ReturnType<typeof pChainInputs>>;

type UtxoInfo = ReturnType<typeof futils.getUtxoInfo>;

/**
 * Whether the account can spend a UTXO alone now: threshold 1, no lock running. getUTXOs also returns outputs the
 * address only co-owns (a 2-of-2, say), which anyone can create for any address.
 */
function spendableAlone(info: UtxoInfo, now: bigint): boolean {
  return info.threshold <= 1 && info.locktime <= now && info.stakeableLocktime <= now;
}

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

/** AVAX the account can spend alone now. */
export function spendableAmount(utxos: PChainInputs["utxos"], avaxAssetID: string, now: bigint): bigint {
  let total = 0n;
  for (const utxo of utxos) {
    const info = futils.getUtxoInfo(utxo);
    if (info.assetId === avaxAssetID && spendableAlone(info, now)) {
      total += info.amount;
    }
  }
  return total;
}

const exportPCTx = (inputs: PChainInputs, amount: bigint): UnsignedTx =>
  pvm.newExportTx(
    {
      feeState: inputs.feeState,
      utxos: inputs.utxos,
      fromAddressesBytes: inputs.from,
      destinationChainId: inputs.context.cBlockchainID,
      outputs: [TransferableOutput.fromNative(inputs.context.avaxAssetID, amount, inputs.from)],
    },
    inputs.context
  );

const FEE_SHORTFALL_RE = /need (\d+) more unlocked nAVAX .*to cover fee/;

/**
 * Exports the spendable total minus the fee of spending every UTXO. Exporting the
 * total first makes flarejs consume every UTXO and report the fee it is short by
 * (the P-chain fee depends on the inputs, so it cannot be a fixed value). flarejs
 * stops taking inputs once the amount and fee are covered, so a UTXO smaller than
 * the fee it adds can be left out. It stays on the P-chain, and so does the
 * change: the fee saved minus that UTXO.
 */
function exportAllPC(inputs: PChainInputs): { amount: bigint; unsignedTx: UnsignedTx } {
  const total = spendableAmount(inputs.utxos, inputs.context.avaxAssetID, nowSeconds());
  let fee = 0n;
  for (let attempt = 0; attempt < 4; attempt++) {
    const amount = total - fee;
    if (amount <= 0n) {
      throw new Error("Export amount is smaller than or equal to zero");
    }
    try {
      return { amount, unsignedTx: exportPCTx(inputs, amount) };
    } catch (error) {
      const shortfall = FEE_SHORTFALL_RE.exec(error instanceof Error ? error.message : String(error))?.[1];
      if (shortfall === undefined) throw error;
      fee += BigInt(shortfall);
    }
  }
  throw new Error("Could not determine the fee of exporting the whole P-chain balance");
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
  // "latest", whatever the signer: the C-chain checks an atomic transaction's nonce against the accepted state,
  // without the transactions waiting in the node
  const nonce = req.nonce ?? BigInt(await env.clients.provider.getTransactionCount(account.cAddress, "latest"));
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
  const inputs = await pChainInputs(env, account, policy);
  return bundle("exportPC", req.amount === undefined ? exportAllPC(inputs).unsignedTx : exportPCTx(inputs, req.amount));
}

/** The amount `exportPC` without `-a` would export now (the interactive default); nothing is signed. */
export async function maxExportPCAmount(env: Env, account: Account, policy: BuildPolicy): Promise<bigint> {
  return exportAllPC(await pChainInputs(env, account, policy)).amount;
}

export async function buildImportPC(
  req: TxRequestOf<"importPC">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  requireFeeForPolicy("importPC", req.fee, policy);
  const [context, pending] = await Promise.all([
    env.clients.context(),
    allUtxos((query) => env.clients.evm.getUTXOs(query), { sourceChain: "P", addresses: [account.cAddressBech] }),
  ]);
  // flarejs (5.2.0) charges the fee to the first UTXO before checking that the account can spend it, and checks time
  // locks against time 0 rather than now, so a co-owned UTXO in front, or a time-locked one even once its lock has
  // passed, made it build an import that pays nothing. It only gets the UTXOs it can import: spendable alone and
  // without a time lock (spendable at time 0).
  const utxos = pending.filter((utxo) => spendableAlone(futils.getUtxoInfo(utxo), 0n));
  if (utxos.length === 0) {
    throw new Error(
      pending.length === 0
        ? "Nothing to import from the P-chain"
        : `Nothing to import from the P-chain that this account can spend alone (${pending.length} UTXO(s) need more signatures or have a time lock, which cannot be imported even once it has passed)`
    );
  }
  let unsignedTx: UnsignedTx;
  if (req.fee === undefined) {
    const baseFee = await env.clients.evm.getBaseFee();
    unsignedTx = evm.newImportTxFromBaseFee(
      context,
      account.cAddressBytes,
      [account.addressBytes],
      utxos,
      context.pBlockchainID,
      estimatedGasPriceGwei(baseFee)
    );
  } else {
    unsignedTx = evm.newImportTx(
      context,
      account.cAddressBytes,
      [account.addressBytes],
      utxos,
      context.pBlockchainID,
      req.fee
    );
  }
  // what the chain burns, read from the transaction itself: exactly -f, or something when estimated
  const paid = atomicTxFee(unsignedTx, context);
  if (req.fee === undefined ? paid <= 0n : paid !== req.fee) {
    const symbol = env.network.symbol;
    throw new Error(
      `The import would pay a fee of ${formatFlr(paid)} ${symbol}` +
        (req.fee === undefined ? "" : ` instead of the ${formatFlr(req.fee)} ${symbol} given`) +
        "; it is not signed"
    );
  }
  return bundle("importPC", unsignedTx);
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
  const to = pChainAddressBytes(req.to, env.network.hrp);
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  return bundle(
    "transfer",
    pvm.newBaseTx(
      {
        feeState,
        utxos,
        fromAddressesBytes: from,
        outputs: [TransferableOutput.fromNative(context.avaxAssetID, req.amount, [to])],
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
  const ownerBytes = (req.ownerAddresses ?? []).map((a) => pChainAddressBytes(a, env.network.hrp));
  const { context, feeState, utxos, from } = await pChainInputs(env, account, policy);
  const owners = ownerBytes.length > 0 ? ownerBytes : from;
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
