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
  parseEndTime,
  parseFlr,
  parsePercentToShares,
} from "../chain/units";
import { contractAddress, stateOfRewards } from "../chain/contracts";
import { currentValidators } from "../chain/validators";
import { resolveEvmFees } from "../constants/fees";
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
import { estimateAtomicFee, runTransaction, underpricedFeeWarning } from "../app/transactions";
import type { Env, Outcome, Signer, TxRequest, TxRequestOf } from "../core/types";
import { describeError, describeFee, log, logError, logInfo, logSuccess, logWarning } from "../output";
import { LedgerSigner, ledgerDevice, type LedgerDevice } from "../signers/ledger";
import { PrivateKeySigner } from "../signers/privateKey";
import { DEFAULT_DELEGATION_FEE_PERCENT, BASE_DERIVATION_PATH, parseBlsHex, pastEndTimeWarning } from "../cli/options";
import { nodeOverridesFromArgv } from "../cli/node";
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
}

const PENDING_IMPORT_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function interactiveCli(baseArgv: string[]): Promise<void> {
  const node = nodeOverridesFromArgv(baseArgv);
  const session = await connectWalletWithRetry(node);
  for (;;) {
    const { task } = await prompts.selectTask();
    if (task === "quit") {
      logInfo("Exiting interactive cli.");
      return;
    }
    // An action that fails must not end the session: report it and show the menu again.
    try {
      await runTask(task, session);
    } catch (error) {
      logError(`Error: ${describeError(error)}`);
    }
  }
}

async function connectWalletWithRetry(node: NodeOverrides): Promise<Session> {
  for (;;) {
    try {
      return await connectWallet(node);
    } catch (error) {
      logError(`Error: ${describeError(error)}`);
    }
  }
}

async function runTask(task: string, session: Session): Promise<void> {
  switch (task) {
    case "addresses":
      log(`P-chain address: ${session.account.pAddress}`);
      log(`C-chain address hex: ${session.account.cAddress}`);
      log(`secp256k1 public key: 0x${session.account.publicKeyHex}`);
      break;
    case "balance": {
      const balances = await getBalances(session.env, session.account);
      logInfo(`Balances on the network "${session.env.network.name}"`);
      log(`C-chain ${session.account.cAddress}: ${formatWei(balances.cChainWei)} ${session.env.network.symbol}`);
      log(`P-chain ${session.account.pAddress}: ${formatFlr(balances.pChainNFlr)} ${session.env.network.symbol}`);
      break;
    }
    case "validators": {
      const validators = await getValidators(session.env);
      log(JSON.stringify(validators, null, 2));
      for (const validator of validators) {
        const summary = describeAutoRenewal(validator);
        if (summary) log(`${validator.nodeID}: ${summary}`);
      }
      break;
    }
    case "CP":
      await moveCP(session);
      break;
    case "PC":
      await movePC(session);
      break;
    case "import": {
      const { type } = await prompts.importTrxType();
      if (type === "P") {
        report(session, await runTransaction({ type: "importCP" }, session.env, session.signer));
      } else {
        const fee = await askCChainFee(session, { type: "importPC" });
        report(session, await runTransaction({ type: "importPC", fee }, session.env, session.signer));
      }
      break;
    }
    case "transfer": {
      const { amount } = await prompts.amount("");
      const { transferAddress } = await prompts.transferAddress();
      report(
        session,
        await runTransaction(
          { type: "transfer", amount: parseFlr(amount), to: transferAddress },
          session.env,
          session.signer
        )
      );
      break;
    }
    case "stake":
      report(session, await runTransaction(await askStake(), session.env, session.signer));
      break;
    case "delegate":
      report(session, await runTransaction(await askDelegate(), session.env, session.signer));
      break;
    case "addAutoRenewedValidator":
      report(session, await runTransaction(await askAutoRenewedValidator(), session.env, session.signer));
      break;
    case "setAutoRenewedValidatorConfig": {
      const { id } = await prompts.nodeId();
      const period = parseDuration((await prompts.period("change")).period);
      if (period === 0n && !(await prompts.confirmStopAutoRenewal(await cycleEndOf(session.env, id))).stop) {
        logInfo("Auto-renewal left unchanged.");
        break;
      }
      report(
        session,
        await runTransaction({ type: "setAutoRenewedValidatorConfig", nodeId: id, period }, session.env, session.signer)
      );
      break;
    }
    case "claim":
      await claim(session);
      break;
    default:
      log("Task not supported");
  }
}

function report(session: Session, outcome: Outcome): void {
  if (outcome.status === "sent") {
    logSuccess(`Transaction with hash ${outcome.txId} built and sent to the network`);
  } else {
    logSuccess(`Unsigned transaction ${outcome.id} constructed`);
    logSuccess(`ForDefi hash: ${outcome.forDefiHash}`);
  }
  const fee = describeFee(outcome, session.env.network.symbol);
  if (fee) logInfo(fee);
}

/** Asks for an end time and warns (as the command line does) when it is not in the future. */
async function askEndTime(): Promise<bigint> {
  const endTime = parseEndTime((await prompts.unixTime("end")).time);
  const warning = pastEndTimeWarning(endTime);
  if (warning) logWarning(warning);
  return endTime;
}

async function askStake(): Promise<TxRequest> {
  const { amount } = await prompts.amount("");
  const { id } = await prompts.nodeId();
  const endTime = await askEndTime();
  const { fee } = await prompts.delegationFee();
  const { popBLSPublicKey } = await prompts.popBLSPublicKey();
  const { popBLSSignature } = await prompts.popBLSSignature();
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
  const { amount } = await prompts.amount("");
  const { id } = await prompts.nodeId();
  const endTime = await askEndTime();
  return { type: "delegate", nodeId: id, amount: parseFlr(amount), endTime };
}

async function askAutoRenewedValidator(): Promise<TxRequest> {
  const { amount } = await prompts.amount("");
  const { id } = await prompts.nodeId();
  const { period } = await prompts.period("add");
  const { fee } = await prompts.delegationFee();
  const { popBLSPublicKey } = await prompts.popBLSPublicKey();
  const { popBLSSignature } = await prompts.popBLSSignature();
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
): Promise<bigint | undefined> {
  const symbol = session.env.network.symbol;
  let estimate: bigint | undefined;
  try {
    estimate = await estimateAtomicFee({ ...req, fee: undefined }, session.env, session.account);
  } catch {
    estimate = undefined;
  }
  for (;;) {
    const { fees } = await prompts.fees(estimate === undefined ? undefined : formatFlr(estimate), symbol);
    if (fees.trim() === "") return undefined;
    const fee = parseFlr(fees);
    const warning = estimate === undefined ? undefined : underpricedFeeWarning(fee, estimate, symbol);
    if (!warning) return fee;
    logWarning(warning);
    if ((await prompts.confirmLowFee()).send) return fee;
  }
}

/** Export from the C-chain, wait for the UTXO to reach the P-chain, import. */
async function moveCP(session: Session): Promise<void> {
  const { amount } = await prompts.amount("");
  const exportCP: TxRequestOf<"exportCP"> = { type: "exportCP", amount: parseFlr(amount) };
  const fee = await askCChainFee(session, exportCP);
  log("Please approve export transaction");
  report(session, await runTransaction({ ...exportCP, fee }, session.env, session.signer));
  await waitForPendingImport(session, "P");
  log("Please approve import transaction");
  report(session, await runTransaction({ type: "importCP" }, session.env, session.signer));
}

/** Export from the P-chain (default: everything minus the fee), wait, import on the C-chain. */
async function movePC(session: Session): Promise<void> {
  const [balances, context] = await Promise.all([
    getBalances(session.env, session.account),
    session.env.clients.context(),
  ]);
  const defaultAmount = balances.pChainNFlr - context.baseTxFee;
  const { amount } = await prompts.amount("", defaultAmount > 0n ? formatFlr(defaultAmount) : undefined);
  log("Please approve export transaction");
  report(session, await runTransaction({ type: "exportPC", amount: parseFlr(amount) }, session.env, session.signer));
  await waitForPendingImport(session, "C");
  const fee = await askCChainFee(session, { type: "importPC" });
  log("Please approve import transaction");
  report(session, await runTransaction({ type: "importPC", fee }, session.env, session.signer));
}

async function waitForPendingImport(session: Session, destination: "P" | "C"): Promise<void> {
  const deadline = Date.now() + PENDING_IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { utxos } =
      destination === "P"
        ? await session.env.clients.pvm.getUTXOs({ addresses: [session.account.pAddress], sourceChain: "C" })
        : await session.env.clients.evm.getUTXOs({ addresses: [session.account.cAddressBech], sourceChain: "P" });
    if (utxos.length > 0) return;
    await sleep(1_000);
  }
  throw new Error(
    `The exported funds did not show up on the ${destination}-chain within ${PENDING_IMPORT_TIMEOUT_MS / 1000}s`
  );
}

async function claim(session: Session): Promise<void> {
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
  const { claimAllUnclaimed } = await prompts.claimAllUnclaimed(formatWei(rewards.unclaimedWei), symbol);
  const amount = claimAllUnclaimed ? undefined : parseFlrToWei(String((await prompts.claimAmount()).claimAmount));
  const { wrapRewards } = await prompts.wrapRewards();
  const { recipientAddress } = await prompts.recipientAddress(session.account.cAddress);
  report(
    session,
    await runTransaction(
      { type: "claim", recipient: recipientAddress, amount, wrap: wrapRewards, fees: resolveEvmFees("claim") },
      session.env,
      session.signer
    )
  );
}

async function connectWallet(node: NodeOverrides): Promise<Session> {
  const { wallet } = await prompts.connectWallet();
  if (wallet === "privateKey") {
    const { pvtKeyPath } = await prompts.pvtKeyPath();
    if (!fs.existsSync(pvtKeyPath)) {
      throw new Error(`File ${pvtKeyPath} doesn't exist`);
    }
    const { network } = await prompts.selectNetwork();
    const env = createEnv(network, node);
    const signer = PrivateKeySigner.fromEnvFile(pvtKeyPath, env.network.hrp);
    return { env, signer, account: await signer.account() };
  }
  if (wallet === "ledger") {
    const device = ledgerDevice();
    const context = await ledgerContext(device);
    const env = createEnv(context.network, node);
    const signer = new LedgerSigner(device, context.derivationPath ?? BASE_DERIVATION_PATH, env.network.hrp);
    return { env, signer, account: await signer.account() };
  }
  throw new Error(`Unsupported wallet ${wallet}`);
}

/**
 * Reuses an existing Ledger ctx.json when the user wants to, otherwise creates
 * one. Any other context (a ForDefi one with its vault id, or an unreadable
 * file) is replaced only after confirmation, and the replaced file is kept as
 * a backup rather than deleted.
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
      const { isContinue } = await prompts.ctxFile();
      if (isContinue) return existing;
    } else if (!(await prompts.replaceCtxFile(DEFAULT_CTX_FILE)).replace) {
      throw new Error(`Kept ${DEFAULT_CTX_FILE}; choose another wallet, or move the file away to connect a Ledger`);
    }
  }
  const { network } = await prompts.selectNetwork();
  const { derivation } = await prompts.derivationType();
  log("Fetching Addresses...");
  const addresses = await derivedAddresses(device, network, derivation);
  const { address } = await prompts.selectAddress(addresses.map((a, i) => `${i + 1}. ${a.ethAddress}`));
  const chosen = addresses.find((a) => a.ethAddress === address);
  if (!chosen) throw new Error("No address selected");
  const context: ContextFile = {
    wallet: "ledger",
    publicKey: chosen.publicKey,
    network,
    ethAddress: chosen.ethAddress,
    flareAddress: accountFromPublicKey(chosen.publicKey, network).pAddress,
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
  derivationMode: string
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
