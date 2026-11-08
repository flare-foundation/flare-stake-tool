/**
 * The inquirer menu: collects answers, builds the same typed requests the
 * command line builds and calls the application layer directly.
 */
import fs from "fs";
import { styleText } from "node:util";
import { accountFromPublicKey, type Account } from "../chain/keys";
import type { NodeOverrides } from "../chain/network";
import {
  formatFlr,
  formatWei,
  parseFlrToWei,
  parseDuration,
  parseFlr,
  parsePercentToShares,
  type NFlr,
} from "../chain/units";
import { contractAddress, stateOfRewards } from "../chain/contracts";
import { currentValidators } from "../chain/validators";
import { resolveEvmFees, type EvmFeeOverrides } from "../constants/fees";
import {
  DEFAULT_CTX_FILE,
  backupContextFile,
  createEnv,
  readContextFile,
  writeContextFile,
  contextFileExists,
  type ContextFile,
} from "../app/env";
import { getBalances, getValidators, describeAutoRenewal } from "../app/info";
import { allUtxos, maxExportPCAmount } from "../core/builders/pchain";
import { estimateAtomicFee, runTransaction, underpricedFeeWarning } from "../app/transactions";
import type { Env, Outcome, Signer, TxRequest, TxRequestOf } from "../core/types";
import { describeError, log, logError, logInfo, logWarning, reportOutcome } from "../output";
import { LedgerSigner, confirmLedgerAccount, ledgerDevice, type LedgerDevice } from "../signers/ledger";
import { PrivateKeySigner } from "../signers/privateKey";
import {
  DEFAULT_DELEGATION_FEE_PERCENT,
  BASE_DERIVATION_PATH,
  endTimeWarnings,
  parseBlsHex,
  parseTime,
} from "../cli/inputs";
import type { DerivationMode, TaskId } from "../constants/screen";
import { prompts } from "./prompts";

interface DerivedAddress {
  ethAddress: string;
  publicKey: string;
  derivationPath: string;
}

interface Session {
  env: Env;
  signer: Signer;
  account: Account;
  /** `--gas-limit`, `--max-fee-per-gas` and `--priority-fee-per-gas` given with `interactive`. */
  evmFees: EvmFeeOverrides;
}

type ConnectedWallet = Omit<Session, "evmFees">;

const PENDING_IMPORT_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the command line gives interactive mode: the node to use and the C-chain fee options. */
export interface InteractiveOptions {
  node: NodeOverrides;
  evmFees: EvmFeeOverrides;
}

export async function interactiveCli(options: InteractiveOptions): Promise<void> {
  const wallet = await connectWalletWithRetry(options.node);
  if (wallet === undefined) {
    logInfo("Exiting interactive cli.");
    return;
  }
  const session: Session = { ...wallet, evmFees: options.evmFees };
  for (;;) {
    const task = await prompts.selectTask();
    if (task === "quit") {
      logInfo("Exiting interactive cli.");
      return;
    }
    // An action that fails must not end the session: report it and show the menu again.
    try {
      await TASKS[task](session);
    } catch (error) {
      logError(`Error: ${describeError(error)}`);
    }
  }
}

/** Asks again after an error, until a wallet is connected; undefined when the user quits. */
async function connectWalletWithRetry(node: NodeOverrides): Promise<ConnectedWallet | undefined> {
  for (;;) {
    try {
      return await connectWallet(node);
    } catch (error) {
      logError(`Error: ${describeError(error)}`);
    }
  }
}

/** What each menu task does, in menu order; a task added to the menu without an entry here fails to compile. */
const TASKS: Record<Exclude<TaskId, "quit">, (session: Session) => Promise<void> | void> = {
  addresses: showAddresses,
  balance: showBalances,
  validators: showValidators,
  CP: moveCP,
  PC: movePC,
  stake: async (session) => {
    await execute(session, await askStake());
  },
  delegate: async (session) => {
    await execute(session, await askDelegate());
  },
  import: importFunds,
  transfer,
  claim,
  addAutoRenewedValidator: async (session) => {
    await execute(session, await askAutoRenewedValidator());
  },
  setAutoRenewedValidatorConfig: setAutoRenewal,
};

function showAddresses(session: Session): void {
  log(`P-chain address: ${session.account.pAddress}`);
  log(`C-chain address hex: ${session.account.cAddress}`);
  log(`secp256k1 public key: 0x${session.account.publicKeyHex}`);
}

async function showBalances(session: Session): Promise<void> {
  const balances = await getBalances(session.env, session.account);
  logInfo(`Balances on the network "${session.env.network.name}"`);
  log(`C-chain ${session.account.cAddress}: ${formatWei(balances.cChainWei)} ${session.env.network.symbol}`);
  log(`P-chain ${session.account.pAddress}: ${formatFlr(balances.pChainNFlr)} ${session.env.network.symbol}`);
}

async function showValidators(session: Session): Promise<void> {
  const validators = await getValidators(session.env);
  log(JSON.stringify(validators, null, 2));
  for (const validator of validators) {
    const summary = describeAutoRenewal(validator);
    if (summary) log(`${validator.nodeID}: ${summary}`);
  }
}

/** Completes an export whose import did not happen, on the chain the user picks. */
async function importFunds(session: Session): Promise<void> {
  if ((await prompts.importTrxType()) === "P") {
    await execute(session, { type: "importCP" });
  } else {
    const fee = await askCChainFee(session, { type: "importPC" });
    await execute(session, { type: "importPC", fee });
  }
}

async function transfer(session: Session): Promise<void> {
  const amount = await prompts.amount();
  const to = await prompts.transferAddress(session.env.network.hrp);
  await execute(session, { type: "transfer", amount: parseFlr(amount), to });
}

/** A period of 0 stops auto-renewal, so it is sent only after a confirmation. */
async function setAutoRenewal(session: Session): Promise<void> {
  const id = await prompts.nodeId();
  const period = parseDuration(await prompts.period("change"));
  if (period === 0n) {
    await session.env.clients.verifyNetwork(); // before a cycle end read from the node is shown
    if (!(await prompts.confirmStopAutoRenewal(await cycleEndOf(session.env, id)))) {
      logInfo("Auto-renewal left unchanged.");
      return;
    }
  }
  await execute(session, { type: "setAutoRenewedValidatorConfig", nodeId: id, period });
}

/** Builds, signs and sends (or writes) a transaction, and reports it as the command line does. */
async function execute(session: Session, request: TxRequest): Promise<Outcome> {
  const outcome = await runTransaction(request, session.env, session.signer);
  reportOutcome(outcome, session.env.network.symbol);
  return outcome;
}

/** Asks for an end time and warns (as the command line does) when it is not in the future. */
async function askEndTime(): Promise<bigint> {
  const endTime = parseTime(await prompts.unixTime("end"));
  for (const warning of endTimeWarnings(endTime)) logWarning(warning);
  return endTime.value;
}

async function askStake(): Promise<TxRequest> {
  const amount = await prompts.amount();
  const id = await prompts.nodeId();
  const endTime = await askEndTime();
  const fee = await prompts.delegationFee();
  const popBLSPublicKey = await prompts.popBLSPublicKey();
  const popBLSSignature = await prompts.popBLSSignature();
  return {
    type: "stake",
    nodeId: id,
    amount: parseFlr(amount),
    endTime,
    delegationFeeShares: parsePercentToShares(fee || DEFAULT_DELEGATION_FEE_PERCENT),
    blsPublicKey: parseBlsHex(popBLSPublicKey, "publicKey"),
    blsSignature: parseBlsHex(popBLSSignature, "signature"),
  };
}

async function askDelegate(): Promise<TxRequest> {
  const amount = await prompts.amount();
  const id = await prompts.nodeId();
  const endTime = await askEndTime();
  return { type: "delegate", nodeId: id, amount: parseFlr(amount), endTime };
}

async function askAutoRenewedValidator(): Promise<TxRequest> {
  const amount = await prompts.amount();
  const id = await prompts.nodeId();
  const period = await prompts.period("add");
  const fee = await prompts.delegationFee();
  const popBLSPublicKey = await prompts.popBLSPublicKey();
  const popBLSSignature = await prompts.popBLSSignature();
  return {
    type: "addAutoRenewedValidator",
    nodeId: id,
    amount: parseFlr(amount),
    period: parseDuration(period),
    delegationFeeShares: parsePercentToShares(fee || DEFAULT_DELEGATION_FEE_PERCENT),
    blsPublicKey: parseBlsHex(popBLSPublicKey, "publicKey"),
    blsSignature: parseBlsHex(popBLSSignature, "signature"),
  };
}

/** End of the validator's current cycle, for the stop confirmation; undefined when it cannot be looked up. */
async function cycleEndOf(env: Env, nodeId: string): Promise<string | undefined> {
  try {
    const validator = (await currentValidators(env, [nodeId])).find((v) => v.nodeID === nodeId);
    return validator ? new Date(Number(validator.endTime) * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fee of a C-chain atomic transaction (exportCP/importPC). The prompt offers
 * the fee the transaction would pay if built now (twice the current base fee,
 * see ESTIMATED_FEE_BASE_FEE_MULTIPLIER), so Enter pays a fee the user has
 * seen; any other fee typed in is paid exactly as given, after a confirmation
 * when it is below the cost at the current base fee. When no estimate can be
 * made (nothing to import yet, say) there is no default and an empty answer is
 * estimated when the transaction is built, as on the command line without
 * `-f`. The menu only signs immediately, so no co-signer needs a fixed fee.
 */
async function askCChainFee(
  session: Session,
  req: TxRequestOf<"exportCP"> | TxRequestOf<"importPC">
): Promise<NFlr | undefined> {
  const symbol = session.env.network.symbol;
  let estimate: NFlr | undefined;
  try {
    estimate = await estimateAtomicFee({ ...req, fee: undefined }, session.env, session.account);
  } catch {
    estimate = undefined;
  }
  for (;;) {
    const answer = await prompts.fees(estimate === undefined ? undefined : formatFlr(estimate), symbol);
    if (answer.trim() === "") return undefined;
    const fee = parseFlr(answer);
    const warning = estimate === undefined ? undefined : underpricedFeeWarning(fee, estimate, symbol);
    if (!warning) return fee;
    logWarning(warning);
    if (await prompts.confirmLowFee()) return fee;
  }
}

/** Export from the C-chain, wait for its UTXO to reach the P-chain, import. */
async function moveCP(session: Session): Promise<void> {
  const amount = await prompts.amount();
  const exportCP: TxRequestOf<"exportCP"> = { type: "exportCP", amount: parseFlr(amount) };
  const fee = await askCChainFee(session, exportCP);
  log("Please approve export transaction");
  const exported = await execute(session, { ...exportCP, fee });
  await waitForExport(session, "P", exported);
  log("Please approve import transaction");
  await execute(session, { type: "importCP" });
}

/** Export from the P-chain, wait, import on the C-chain. The amount offered is what `exportPC` without -a exports. */
async function movePC(session: Session): Promise<void> {
  let defaultAmount: string | undefined;
  try {
    await session.env.clients.verifyNetwork();
    defaultAmount = formatFlr(await maxExportPCAmount(session.env, session.account, session.signer.policy));
  } catch {
    defaultAmount = undefined; // nothing to export, or the node is unreachable: no default
  }
  const amount = await prompts.amount(defaultAmount);
  log("Please approve export transaction");
  const exported = await execute(session, { type: "exportPC", amount: parseFlr(amount) });
  await waitForExport(session, "C", exported);
  const fee = await askCChainFee(session, { type: "importPC" });
  log("Please approve import transaction");
  await execute(session, { type: "importPC", fee });
}

/**
 * Waits until the export's own UTXOs reach the destination chain. An earlier export that was never imported is
 * pending there as well, and importing as soon as it showed up could leave this one behind.
 */
async function waitForExport(session: Session, destination: "P" | "C", exported: Outcome): Promise<void> {
  if (exported.status !== "sent") {
    throw new Error("The export was not sent, so there is nothing to import yet");
  }
  const { env, account } = session;
  const deadline = Date.now() + PENDING_IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const utxos =
      destination === "P"
        ? await allUtxos((query) => env.clients.pvm.getUTXOs(query), {
            addresses: [account.pAddress],
            sourceChain: "C",
          })
        : await allUtxos((query) => env.clients.evm.getUTXOs(query), {
            addresses: [account.cAddressBech],
            sourceChain: "P",
          });
    if (utxos.some((utxo) => utxo.utxoId.txID.toString() === exported.txId)) return;
    await sleep(1_000);
  }
  throw new Error(
    `The exported funds (${exported.txId}) did not show up on the ${destination}-chain within ${PENDING_IMPORT_TIMEOUT_MS / 1000}s`
  );
}

async function claim(session: Session): Promise<void> {
  await session.env.clients.verifyNetwork(); // before rewards read from the node are shown
  const rewardManager = await contractAddress(session.env, "ValidatorRewardManager");
  const rewards = await stateOfRewards(session.env, rewardManager, session.account.cAddress);
  const symbol = session.env.network.symbol;
  log(
    styleText(
      "yellow",
      `State of rewards for ${session.account.cAddress}:\n` +
        `Total rewards: ${formatWei(rewards.totalWei)} ${symbol}\n` +
        `Claimed rewards: ${formatWei(rewards.claimedWei)} ${symbol}\n` +
        `Unclaimed rewards: ${formatWei(rewards.unclaimedWei)} ${symbol}`
    )
  );
  if (rewards.unclaimedWei === 0n) {
    log(styleText("green", "Nothing to claim!"));
    return;
  }
  const claimAll = await prompts.claimAllUnclaimed(formatWei(rewards.unclaimedWei), symbol);
  const amount = claimAll ? undefined : parseFlrToWei(await prompts.claimAmount());
  const wrap = await prompts.wrapRewards();
  const recipient = await prompts.recipientAddress(session.account.cAddress);
  await execute(session, {
    type: "claim",
    recipient,
    amount,
    wrap,
    fees: resolveEvmFees("claim", session.evmFees),
  });
}

async function connectWallet(node: NodeOverrides): Promise<ConnectedWallet | undefined> {
  const wallet = await prompts.connectWallet();
  if (wallet === "quit") {
    return undefined;
  }
  if (wallet === "privateKey") {
    const pvtKeyPath = await prompts.pvtKeyPath();
    if (!fs.existsSync(pvtKeyPath)) {
      throw new Error(`File ${pvtKeyPath} doesn't exist`);
    }
    const network = await prompts.selectNetwork();
    const env = createEnv(network, node);
    const signer = PrivateKeySigner.fromEnvFile(pvtKeyPath, env.network.hrp);
    return { env, signer, account: await signer.account() };
  }
  if (wallet === "ledger") {
    const device = ledgerDevice();
    const context = await ledgerContext(device);
    const env = createEnv(context.network, node);
    // the device must still have the context's key: another Ledger plugged in while choosing the address, or since
    // the saved context was checked, would otherwise become the session's account
    const path = context.derivationPath ?? BASE_DERIVATION_PATH;
    const signer = new LedgerSigner(device, path, env.network.hrp, context.publicKey);
    return { env, signer, account: await signer.account() };
  }
  const unsupported: never = wallet; // a wallet added to the menu without a branch here fails to compile
  throw new Error(`Unsupported wallet ${String(unsupported)}`);
}

/** The account the connected Ledger has at a saved context's derivation path. */
async function connectedAccount(device: LedgerDevice, context: ContextFile): Promise<Account> {
  const path = context.derivationPath ?? BASE_DERIVATION_PATH;
  return accountFromPublicKey(await device.getPublicKey(path, context.network), context.network);
}

/**
 * Reuses an existing Ledger ctx.json when the user wants to and the connected
 * device has its key, otherwise creates one: a different device or seed would
 * sign for another account than the one just shown. Any other context (a
 * ForDefi one with its vault id, or an unreadable file) is replaced only after
 * confirmation, and the replaced file is kept as a backup rather than deleted.
 */
async function ledgerContext(device: LedgerDevice): Promise<ContextFile> {
  const replacing = contextFileExists(DEFAULT_CTX_FILE);
  if (replacing) {
    let existing: ContextFile | undefined;
    try {
      existing = readContextFile(DEFAULT_CTX_FILE);
    } catch (error) {
      log(styleText("magenta", `${DEFAULT_CTX_FILE} exists but cannot be used: ${describeError(error)}`));
    }
    if (existing) {
      log(styleText("magenta", `You already have a ${DEFAULT_CTX_FILE} with the following parameters:`));
      log(`${styleText("yellow", "Wallet:")} ${existing.wallet}`);
      log(`${styleText("yellow", "Public Key:")} ${existing.publicKey}`);
      log(`${styleText("yellow", "Network:")} ${existing.network}`);
      if (existing.ethAddress) log(`${styleText("yellow", "Eth Address:")} ${existing.ethAddress}`);
      if (existing.vaultId) log(`${styleText("yellow", "Vault Id:")} ${existing.vaultId}`);
    }
    if (existing?.wallet === "ledger") {
      if (await prompts.ctxFile()) {
        const connected = await connectedAccount(device, existing);
        const saved = accountFromPublicKey(existing.publicKey, existing.network);
        if (connected.publicKeyHex === saved.publicKeyHex) return existing;
        logWarning(
          `The connected Ledger has ${connected.cAddress} at ${existing.derivationPath ?? BASE_DERIVATION_PATH}, ` +
            `not the ${saved.cAddress} saved in ${DEFAULT_CTX_FILE}`
        );
        if (!(await prompts.replaceCtxFile(DEFAULT_CTX_FILE))) {
          throw new Error(`Kept ${DEFAULT_CTX_FILE}; connect the Ledger it was made with, or replace it`);
        }
      }
    } else if (!(await prompts.replaceCtxFile(DEFAULT_CTX_FILE))) {
      throw new Error(`Kept ${DEFAULT_CTX_FILE}; choose another wallet, or move the file away to connect a Ledger`);
    }
  }
  const network = await prompts.selectNetwork();
  const derivation = await prompts.derivationType();
  log("Fetching Addresses...");
  const addresses = await derivedAddresses(device, network, derivation);
  // The row itself, so that its derivation path is saved even when two rows show the same address.
  const chosen = await prompts.selectAddress(
    addresses.map((a, i) => ({ name: `${i + 1}. ${a.ethAddress}`, value: a }))
  );
  // The device shows the chosen address, as for init-ctx --ledger: the listed keys came through the host, and one
  // substituted there would be saved and funded without the device ever showing it.
  const confirmed = await confirmLedgerAccount(device, chosen.derivationPath, network);
  if (confirmed.account.publicKeyHex !== accountFromPublicKey(chosen.publicKey, network).publicKeyHex) {
    throw new Error(
      `The Ledger now has ${confirmed.account.cAddress} at ${chosen.derivationPath}, not the ${chosen.ethAddress} ` +
        "listed; no context file was written"
    );
  }
  const context: ContextFile = {
    wallet: "ledger",
    publicKey: confirmed.publicKey,
    network,
    ethAddress: confirmed.account.cAddress,
    flareAddress: confirmed.account.pAddress,
    derivationPath: chosen.derivationPath,
  };
  // Only now, with the new context complete, does the previous file make way.
  if (replacing) {
    log(`Previous ${DEFAULT_CTX_FILE} kept as ${backupContextFile(DEFAULT_CTX_FILE)}`);
  }
  writeContextFile(context, DEFAULT_CTX_FILE);
  return context;
}

async function derivedAddresses(
  device: LedgerDevice,
  network: string,
  derivationMode: DerivationMode
): Promise<DerivedAddress[]> {
  const paths: string[] = [];
  for (let i = 0; i < 10; i++) {
    paths.push(derivationMode === "ledger_live" ? `m/44'/60'/${i}'/0/0` : `m/44'/60'/0'/0/${i}`);
  }
  const results: DerivedAddress[] = [];
  for (const derivationPath of paths) {
    const publicKey = await device.getPublicKey(derivationPath, network);
    results.push({ ethAddress: accountFromPublicKey(publicKey, network).cAddress, derivationPath, publicKey });
  }
  return results;
}
