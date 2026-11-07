/**
 * One builder per P-chain / atomic transaction type, over flarejs'
 * object-style builders. Builders only build; validation that needs chain
 * state (stake limits, validator existence, fork gates) lives in app/.
 */
import {
  TransferableInput,
  TransferInput,
  TransferOutput,
  TransferableOutput,
  evm,
  messageHashFromUnsignedTx,
  networkIDs,
  pvm,
  pvmSerial,
  utils as futils,
  type Context,
  type UnsignedTx,
} from "@flarenetwork/flarejs";
import { pChainAddressBytes, type Account } from "../../chain/keys";
import { asNFlr, formatFlr, type NFlr } from "../../chain/units";
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

const WEI_PER_GWEI = 1_000_000_000n;
const PRIMARY_NETWORK = networkIDs.PrimaryNetworkID.toString();

function bundle(txType: AtomicTxType, unsignedTx: UnsignedTx, notices: readonly string[] = []): UnsignedTxBundle {
  return {
    kind: "atomic",
    chain: chainOfAtomicTx(txType),
    txType,
    unsignedTx,
    digest: messageHashFromUnsignedTx(unsignedTx),
    ...(notices.length > 0 ? { notices } : {}),
  };
}

/** Base fee in gwei (nFLR), rounded up, as the flarejs `*FromBaseFee` builders expect. */
const baseFeeGwei = (baseFeeWei: bigint): bigint => (baseFeeWei + WEI_PER_GWEI - 1n) / WEI_PER_GWEI;

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
function requireFeeForPolicy(type: "exportCP" | "importPC", fee: NFlr | undefined, policy: BuildPolicy): void {
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

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

type PChainUtxo = Awaited<ReturnType<typeof allUtxos>>[number];

const amountOf = (utxo: PChainUtxo): bigint => futils.getUtxoInfo(utxo).amount;
const totalOf = (utxos: readonly PChainUtxo[]): NFlr => asNFlr(utxos.reduce((sum, utxo) => sum + amountOf(utxo), 0n));
const describeUtxos = (utxos: readonly PChainUtxo[], symbol: string) =>
  `${utxos.length} UTXO(s) (${formatFlr(totalOf(utxos))} ${symbol})`;

/**
 * The gas an input spending `utxo` with one signature adds to a P-chain transaction (flarejs `getInputComplexity`):
 * a plain input, or for a stakeable-locked UTXO the stakeable-locked input that spends it, which costs a little more.
 */
function pChainInputGas(utxo: PChainUtxo, weights: Context.Context["platformFeeConfig"]["weights"]): bigint {
  const plain = TransferInput.fromNative(amountOf(utxo), [0]);
  const spend =
    utxo.output instanceof pvmSerial.StakeableLockOut
      ? new pvmSerial.StakeableLockIn(utxo.output.lockTime, plain)
      : plain;
  const complexity = pvm.getInputComplexity([new TransferableInput(utxo.utxoId, utxo.assetId, spend)]);
  return ([0, 1, 2, 3] as const).reduce((gas, d) => gas + BigInt(complexity[d]) * BigInt(weights[d]), 0n);
}

/**
 * The context, fee state and UTXOs a P-chain builder works from (with `sourceChain` "C": the UTXOs exported from the
 * C-chain, for importCP). When spending P-chain UTXOs, one worth less than the fee its own input adds at the lowest
 * price (the fee config's `minPrice`) costs more to spend than it brings at any price, and anyone can send such dust
 * to any address, plain or stakeable-locked with any lock (go-flare lets unlocked funds pay for a locked output).
 * flarejs spends UTXOs in the order given until the amount and fee are covered (a stake takes locked ones first), so
 * dust in front made a transaction pay more, and enough of it pushed the transaction over the gas capacity. It is
 * left out, of the inputs and of the balance exportPC without -a exports, and `notices` says so. The rest, locked or
 * not, keep the node's order: an account without dust builds exactly as before.
 */
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
  // read once, so the inputs flarejs picks and the balance spendableAmount counts follow the same time
  const minIssuanceTime = policy.lockCheckTime === "now" ? nowSeconds() : policy.lockCheckTime;
  const inputs = { context, feeState, utxos, from: [account.addressBytes], minIssuanceTime, notices: [] as string[] };
  if (sourceChain) {
    return inputs; // importCP chooses its own (chooseImported)
  }
  const { weights, minPrice } = context.platformFeeConfig;
  const isDust = (utxo: PChainUtxo) =>
    (utxo.output instanceof TransferOutput || utxo.output instanceof pvmSerial.StakeableLockOut) &&
    amountOf(utxo) < pChainInputGas(utxo, weights) * minPrice;
  const dust = utxos.filter(isDust);
  if (dust.length === 0) {
    return inputs;
  }
  const notice = `${describeUtxos(dust, env.network.symbol)} left out: each is worth less than the fee of spending it`;
  return { ...inputs, utxos: utxos.filter((utxo) => !isDust(utxo)), notices: [notice] };
}

type PChainInputs = Awaited<ReturnType<typeof pChainInputs>>;

/** What every flarejs P-chain builder takes from the inputs: fee state, UTXOs, spender and lock time. */
const spending = (inputs: PChainInputs) => ({
  feeState: inputs.feeState,
  utxos: inputs.utxos,
  fromAddressesBytes: inputs.from,
  minIssuanceTime: inputs.minIssuanceTime,
});

/** The earliest `minIssuanceTime` at which a UTXO without a time lock can be spent: flarejs compares locks strictly. */
const NO_TIME_LOCK = 1n;

/**
 * Whether the account can spend a UTXO alone at `time`: threshold 1, and no lock running as flarejs checks it (the
 * output's own lock, stakeable or else the owner lock, must be before `time`, and the owner lock not after it).
 * getUTXOs also returns outputs the address only co-owns (a 2-of-2, say), which anyone can create for any address.
 */
function spendableAlone(utxo: PChainUtxo, time: bigint): boolean {
  const info = futils.getUtxoInfo(utxo);
  const ownLock = utxo.output instanceof pvmSerial.StakeableLockOut ? info.stakeableLocktime : info.locktime;
  return info.threshold <= 1 && ownLock < time && info.locktime <= time;
}

/** AVAX the account can spend alone at `time` (the build's `minIssuanceTime`). */
export function spendableAmount(utxos: PChainInputs["utxos"], avaxAssetID: string, time: bigint): NFlr {
  let total = 0n;
  for (const utxo of utxos) {
    const info = futils.getUtxoInfo(utxo);
    if (info.assetId === avaxAssetID && spendableAlone(utxo, time)) {
      total += info.amount;
    }
  }
  return asNFlr(total);
}

const exportPCTx = (inputs: PChainInputs, amount: NFlr): UnsignedTx =>
  pvm.newExportTx(
    {
      ...spending(inputs),
      destinationChainId: inputs.context.cBlockchainID,
      outputs: [TransferableOutput.fromNative(inputs.context.avaxAssetID, amount, inputs.from)],
    },
    inputs.context
  );

/** The fee probe's gas capacity: no limit (uint64 max), since the probe is never sent. */
const PROBE_GAS_CAPACITY = 2n ** 64n - 1n;

/**
 * Exports the spendable total minus the fee of spending every UTXO. The P-chain
 * fee depends on the inputs, so it cannot be a fixed value: a probe exporting the
 * total at fee price 0 spends every UTXO, `pvm.calculateFee` prices it at the real
 * price, and the export is built for the total minus that fee. The probe is never
 * signed or sent, and is built on a copy of the fee state with no gas limit: with
 * every UTXO it can be too big for the chain while the export is not. flarejs stops
 * taking inputs once the amount and fee are covered, so a UTXO smaller than the fee
 * it adds can be left out. It stays on the P-chain, and so does the change: the fee
 * saved minus that UTXO. The export itself is checked against the real gas capacity.
 */
function exportAllPC(inputs: PChainInputs): { amount: NFlr; unsignedTx: UnsignedTx } {
  const total = spendableAmount(inputs.utxos, inputs.context.avaxAssetID, inputs.minIssuanceTime);
  if (total <= 0n) {
    throw new Error("Export amount is smaller than or equal to zero");
  }
  const probeFeeState = { ...inputs.feeState, price: 0n, capacity: PROBE_GAS_CAPACITY };
  const probe = exportPCTx({ ...inputs, feeState: probeFeeState }, total);
  const fee = pvm.calculateFee(probe.getTx(), inputs.context.platformFeeConfig.weights, inputs.feeState.price);
  const amount = asNFlr(total - fee);
  if (amount <= 0n) {
    throw new Error("Export amount is smaller than or equal to zero");
  }
  return { amount, unsignedTx: exportPCTx(inputs, amount) };
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

/** Largest first, equal amounts by UTXO id in plain string order, which unlike localeCompare is the same everywhere. */
function largestFirst(utxos: readonly PChainUtxo[]): PChainUtxo[] {
  return [...utxos].sort((a, b) => {
    const [x, y, idA, idB] = [amountOf(a), amountOf(b), a.ID(), b.ID()];
    if (x !== y) return x > y ? -1 : 1;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}

/**
 * The UTXOs an import (importCP, importPC) takes. One worth less than the fee its own input adds at the lowest
 * price (`minPrice` nFLR per gas) brings less than it costs at any price, and anyone can send such dust to any
 * address: it is skipped. The rest are taken largest first while the import's gas (`gasOf`) stays within
 * `gasLimit`; the others stay pending for a later import. Only fixed values decide, so every co-signer takes the
 * same UTXOs, with or without -f. The UTXOs taken keep the node's order, which flarejs keeps in the unsigned file's
 * UTXO list, so an import that leaves nothing out is built exactly as before.
 */
function chooseImported(
  utxos: readonly PChainUtxo[],
  inputGas: (utxo: PChainUtxo) => bigint,
  minPrice: bigint,
  gasLimit: bigint,
  gasOf: (utxos: PChainUtxo[]) => bigint
): { taken: PChainUtxo[]; skipped: PChainUtxo[]; later: PChainUtxo[] } {
  const worth = (utxo: PChainUtxo) => amountOf(utxo) >= inputGas(utxo) * minPrice;
  const skipped = utxos.filter((utxo) => !worth(utxo));
  const ranked = largestFirst(utxos.filter(worth));
  let count = ranked.length;
  // every input adds at least its own gas, so dropping the smallest until the excess is covered is enough
  for (let excess = count > 0 ? gasOf(ranked) - gasLimit : 0n; excess > 0n && count > 0; count--) {
    excess -= inputGas(ranked[count - 1]!);
  }
  const taken = new Set(ranked.slice(0, count));
  return { taken: utxos.filter((utxo) => taken.has(utxo)), skipped, later: ranked.slice(count) };
}

/** The warnings for what an import left out; `capacity` names the limit that kept the later ones out. */
function importNotices(chosen: ReturnType<typeof chooseImported>, symbol: string, capacity: string): string[] {
  const { taken, skipped, later } = chosen;
  return [
    ...(later.length > 0
      ? [
          `${describeUtxos(later, symbol)} stay pending for a later import: ${capacity} fits only ${taken.length} in one`,
        ]
      : []),
    ...(skipped.length > 0
      ? [
          `${describeUtxos(skipped, symbol)} skipped: each is worth less than the fee of importing it, and stays pending`,
        ]
      : []),
  ];
}

/**
 * Imports the UTXOs exported from the C-chain, skipping dust and staying within the P-chain's gas capacity (see
 * chooseImported). The lowest price and the capacity come from the fee config, which is fixed, not from the fee
 * state. flarejs checks the import against the fee state's capacity, which each transaction lowers and which refills
 * by `maxPerSecond` a second, so the import leaves one second of refill as headroom. That is not a guarantee: after
 * a burst of transactions flarejs refuses it ("exceeds capacity"), and the same import fits a few seconds later.
 * Choosing by the live capacity instead would let co-signers choose differently.
 */
export async function buildImportCP(
  _req: TxRequestOf<"importCP">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const inputs = await pChainInputs(env, account, policy, "C");
  const { context } = inputs;
  const { weights, minPrice, maxCapacity, maxPerSecond } = context.platformFeeConfig;
  const build = (utxos: PChainUtxo[], feeState = inputs.feeState) =>
    pvm.newImportTx(
      { ...spending(inputs), feeState, utxos, sourceChainId: context.cBlockchainID, toAddressesBytes: inputs.from },
      context
    );
  // what flarejs imports: a plain output of the account, alone, with no lock after the build's time
  const importable = inputs.utxos.filter((utxo) => {
    const info = futils.getUtxoInfo(utxo);
    return (
      utxo.output instanceof TransferOutput &&
      info.assetId === context.avaxAssetID &&
      info.threshold <= 1 &&
      info.locktime <= inputs.minIssuanceTime
    );
  });
  const inputGas = (utxo: PChainUtxo) => pChainInputGas(utxo, weights);
  const probeFeeState = { ...inputs.feeState, price: 0n, capacity: PROBE_GAS_CAPACITY };
  const chosen = chooseImported(importable, inputGas, minPrice, maxCapacity - maxPerSecond, (utxos) =>
    pvm.calculateFee(build(utxos, probeFeeState).getTx(), weights, 1n)
  );
  const symbol = env.network.symbol;
  if (chosen.taken.length === 0 && chosen.skipped.length > 0) {
    throw new Error(
      `Nothing worth importing from the C-chain: ${describeUtxos(chosen.skipped, symbol)}, each worth less than the fee of importing it`
    );
  }
  // with nothing importable at all, flarejs says so ("no UTXOs available to import")
  return bundle("importCP", build(chosen.taken), importNotices(chosen, symbol, "the P-chain's gas capacity"));
}

export async function buildExportPC(
  req: TxRequestOf<"exportPC">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const inputs = await pChainInputs(env, account, policy);
  const unsignedTx = req.amount === undefined ? exportAllPC(inputs).unsignedTx : exportPCTx(inputs, req.amount);
  return bundle("exportPC", unsignedTx, inputs.notices);
}

/** The amount `exportPC` without `-a` would export now (the interactive default); nothing is signed. */
export async function maxExportPCAmount(env: Env, account: Account, policy: BuildPolicy): Promise<NFlr> {
  return exportAllPC(await pChainInputs(env, account, policy)).amount;
}

/**
 * The most gas a C-chain atomic transaction can use: coreth `ap5.AtomicGasLimit`, the atomic gas of a block and of
 * the mempool. A bigger import is never accepted.
 */
export const C_ATOMIC_GAS_LIMIT = 100_000n;

/** The C-chain base fee floor since Granite (go-flare `granite.MinGasPrice`), in gwei: nFLR per gas. */
const C_MIN_BASE_FEE_GWEI = 500n;

/**
 * The gas one more UTXO adds to an importPC, as coreth `UnsignedImportTx.GasUsed` and flarejs `costCorethTx` count
 * it: the input's 88 bytes (UTXO id 36, asset id 32, type 4, amount 8, one signature index 8) and its signature.
 */
export const IMPORT_PC_INPUT_GAS = 88n * futils.CTxBytesGas + futils.CCostPerSignature;

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
  // without a time lock.
  const importable = pending.filter((utxo) => spendableAlone(utxo, NO_TIME_LOCK));
  if (importable.length === 0) {
    throw new Error(
      pending.length === 0
        ? "Nothing to import from the P-chain"
        : `Nothing to import from the P-chain that this account can spend alone (${pending.length} UTXO(s) need more signatures or have a time lock, which cannot be imported even once it has passed)`
    );
  }
  const build = (utxos: PChainUtxo[], fee: bigint) =>
    evm.newImportTx(context, account.cAddressBytes, [account.addressBytes], utxos, context.pBlockchainID, fee);
  const chosen = chooseImported(
    importable,
    () => IMPORT_PC_INPUT_GAS,
    C_MIN_BASE_FEE_GWEI,
    C_ATOMIC_GAS_LIMIT,
    (utxos) => futils.costCorethTx(build(utxos, 0n))
  );
  const symbol = env.network.symbol;
  if (chosen.taken.length === 0) {
    throw new Error(
      `Nothing worth importing from the P-chain: ${describeUtxos(chosen.skipped, symbol)}, each worth less than the fee of importing it`
    );
  }
  const utxos = chosen.taken;
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
    unsignedTx = build(utxos, req.fee);
  }
  // what the chain burns, read from the transaction itself: exactly -f, or something when estimated
  const paid = atomicTxFee(unsignedTx, context);
  if (req.fee === undefined ? paid <= 0n : paid !== req.fee) {
    throw new Error(
      `The import would pay a fee of ${formatFlr(paid)} ${symbol}` +
        (req.fee === undefined ? "" : ` instead of the ${formatFlr(req.fee)} ${symbol} given`) +
        "; it is not signed"
    );
  }
  return bundle("importPC", unsignedTx, importNotices(chosen, symbol, "the C-chain's atomic gas limit"));
}

export async function buildStake(
  req: TxRequestOf<"stake">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const inputs = await pChainInputs(env, account, policy);
  const { context, from } = inputs;
  return bundle(
    "stake",
    pvm.newAddPermissionlessValidatorTx(
      {
        ...spending(inputs),
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
    ),
    inputs.notices
  );
}

export async function buildDelegate(
  req: TxRequestOf<"delegate">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const inputs = await pChainInputs(env, account, policy);
  const { context, from } = inputs;
  return bundle(
    "delegate",
    pvm.newAddPermissionlessDelegatorTx(
      {
        ...spending(inputs),
        nodeId: req.nodeId,
        subnetId: PRIMARY_NETWORK,
        start: startTime(req.startTime, policy),
        end: req.endTime,
        weight: req.amount,
        rewardAddresses: from,
      },
      context
    ),
    inputs.notices
  );
}

export async function buildTransfer(
  req: TxRequestOf<"transfer">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const to = pChainAddressBytes(req.to, env.network.hrp);
  const inputs = await pChainInputs(env, account, policy);
  const { context } = inputs;
  return bundle(
    "transfer",
    pvm.newBaseTx(
      {
        ...spending(inputs),
        outputs: [TransferableOutput.fromNative(context.avaxAssetID, req.amount, [to])],
      },
      context
    ),
    inputs.notices
  );
}

export async function buildAddAutoRenewedValidator(
  req: TxRequestOf<"addAutoRenewedValidator">,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  const ownerBytes = (req.ownerAddresses ?? []).map((a) => pChainAddressBytes(a, env.network.hrp));
  const inputs = await pChainInputs(env, account, policy);
  const { context, from } = inputs;
  const owners = ownerBytes.length > 0 ? ownerBytes : from;
  return bundle(
    "addAutoRenewedValidator",
    pvm.newAddAutoRenewedValidatorTx(
      {
        ...spending(inputs),
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
    ),
    inputs.notices
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
  const inputs = await pChainInputs(env, account, policy);
  const { context } = inputs;
  return bundle(
    "setAutoRenewedValidatorConfig",
    pvm.newSetAutoRenewedValidatorConfigTx(
      {
        ...spending(inputs),
        validatorTxId,
        auth: [authIndex],
        autoCompoundRewardShares: req.autoCompoundShares ?? 0,
        period: req.period,
      },
      context
    ),
    inputs.notices
  );
}
