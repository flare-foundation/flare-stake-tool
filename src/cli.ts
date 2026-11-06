/**
 * Commander definitions. Each action parses its options into a typed request,
 * resolves the environment and the signer, and calls the application layer;
 * no transaction logic lives here.
 */
import { Command } from "commander";
import { accountFromPublicKey } from "./chain/keys";
import { formatFlr, formatWei } from "./chain/units";
import { ATOMIC_TX_TYPES } from "./core/types";
import { isAlreadySentToChain } from "./core/files";
import {
  contextFileExists,
  readContextFile,
  resolveNetworkName,
  writeContextFile,
  accountFromContextFile,
  type ContextFile,
} from "./app/env";
import { fetchForDefiSignature, sendToForDefi } from "./app/fordefi";
import { describeAutoRenewal, getBalances, getValidators } from "./app/info";
import { sendSignedTransaction } from "./app/send";
import { runTransaction } from "./app/transactions";
import {
  BASE_DERIVATION_PATH,
  END_TIME,
  START_TIME,
  START_TIME_NOT_USED_WARNING,
  pastEndTimeWarning,
  type ParsedTime,
} from "./cli/inputs";
import { globalOptions, resolveAccount, resolveEnv, resolveSigner, type GlobalOptions } from "./cli/options";
import { parseAtomicTxRequest, parseEvmTxRequest, type AtomicTxOptions, type EvmTxOptions } from "./cli/requests";
import { API_KEY_DESCRIPTION, API_KEY_OPTION, RPC_URL_DESCRIPTION, RPC_URL_OPTION } from "./cli/node";
import { log, logInfo, logSuccess, logWarning, reportOutcome } from "./output";
import { FAKE_LEDGER_KEY_ENV, ledgerDevice } from "./signers/ledger";
import * as ledger from "./ledger";

const TRANSACTION_TYPES = ATOMIC_TX_TYPES.join("|");

/** Options of `init-ctx`. */
interface InitCtxOptions {
  publicKey?: string;
  vaultId?: string;
}

/** Options of `send` and `forDefi`. */
type TransactionIdOptions = Pick<GlobalOptions, "transactionId">;

export function cli(program: Command): void {
  program
    .option("--network <network>", "Network name (flare|songbird|costwo|coston|localflare)")
    .option(RPC_URL_OPTION, RPC_URL_DESCRIPTION)
    .option(API_KEY_OPTION, API_KEY_DESCRIPTION)
    .option("--ledger", "Use ledger to sign transactions")
    .option("--blind", "Blind signing (accepted for compatibility; signing mode is chosen automatically)", true)
    .option("--derivation-path <derivation-path>", "Ledger address derivation path", BASE_DERIVATION_PATH)
    .option("--ctx-file <file>", "Context file as returned by init-ctx", "ctx.json")
    .option("--env-path <path>", "Path to the .env file")
    .option("--get-hacked", "Use the .env file with the exposed private key")
    .option(
      "--max-fee-per-gas <gwei>",
      "C-chain EVM max fee per gas, in gwei. A cap, not a price: the transaction pays base fee plus tip, at most this"
    )
    .option("--priority-fee-per-gas <gwei>", "C-chain EVM priority fee (tip) per gas, in gwei")
    .option("--gas-limit <units>", "C-chain EVM gas limit")
    .addHelpText(
      "after",
      "\nC-chain fee options are fixed values rather than chain estimates, so that every ForDefi\n" +
        "signer of a transaction arrives at the same hash. All signers of one transaction must\n" +
        "pass the same values.\n\n" +
        "Times: --end-time, --start-time and --period accept unix seconds or a duration such as\n" +
        "2d12h (units w, d, h, m, s); an end time given as a duration is added to now."
    );

  program
    .command("interactive")
    .description("Interactive mode")
    .action(() => {
      // never runs: src/run.ts dispatches "interactive" before Commander; listed for --help
    });

  program
    .command("init-ctx")
    .description("Initialize context file")
    .option("-p, --public-key <public-key>", "Public key of the account")
    .option("--vault-id <vault-id>", "ForDefi vault id to store in the context file")
    .action(async (options: InitCtxOptions) => {
      await initCtx(globalOptions(program.opts(), options));
    });

  program
    .command("info")
    .description("Relevant information")
    .argument("<addresses|balance|validators>", "Type of information")
    .action(async (type: string) => {
      await info(type, globalOptions(program.opts()));
    });

  program
    .command("transaction")
    .description("Move funds between chains or P-chain addresses, stake, delegate, manage auto-renewed validators")
    .argument(`<${TRANSACTION_TYPES}>`, "Type of transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("-a, --amount <amount>", "Amount (in FLR)")
    .option("-f, --fee <fee>", "Transaction fee (in FLR; exportCP/importPC)")
    .option("-n, --node-id <nodeId>", "The id of the node to stake/delegate to")
    .option("-s, --start-time <start-time>", "Start time (unix seconds or duration from now)")
    .option("-e, --end-time <end-time>", "End time (unix seconds or duration from now, e.g. 2d12h)")
    .option("--nonce <nonce>", "C-chain nonce of the constructed transaction (exportCP)")
    .option("--delegation-fee <delegation-fee>", "Delegation fee in percent charged by the validator", "20")
    .option("--pop-bls-public-key <popBlsPublicKey>", "BLS Public Key")
    .option("--pop-bls-signature <popBlsSignature>", "BLS Signature")
    .option("--transfer-address <transfer-address>", "P-chain address to transfer funds to")
    .option("--period <period>", "Auto-renewed validator period (seconds or duration, e.g. 14d); 0 stops auto-renewal")
    .option(
      "--auto-compound-shares <millionths>",
      "Share of rewards restaked each cycle, in millionths (0..1000000)",
      "0"
    )
    .option(
      "--owner-address <address...>",
      "P-chain address(es) allowed to change the auto-renew config (default: own address)"
    )
    .option(
      "--validator-tx-id <txID>",
      "Transaction id of the auto-renewed validator to reconfigure (alternative to --node-id)"
    )
    .option("--threshold <threshold>", "Accepted for compatibility; has no effect", "1")
    .action(async (type: string, options: AtomicTxOptions) => {
      await transaction(type, globalOptions(program.opts(), options));
    });

  program
    .command("send")
    .description("Send signed transaction json to the node")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to send to the network")
    .action(async (options: TransactionIdOptions) => {
      await send(globalOptions(program.opts(), options));
    });

  program
    .command("forDefi")
    .description("Sign with ForDefi")
    .argument("<sign|fetch>", "Type of a forDefi transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize")
    .option("--evm-tx", "Accepted for compatibility; the transaction file tells the kind")
    .action(async (type: string, options: TransactionIdOptions) => {
      await forDefi(type, globalOptions(program.opts(), options));
    });

  program
    .command("withdrawal")
    .description("Withdraw (transfer) funds on the C-chain")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("-a, --amount <amount>", "Amount to transfer (in FLR)")
    .option("-t, --to <to>", "Address to send funds to")
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .action(async (options: EvmTxOptions) => {
      await evmTransaction("withdrawal", globalOptions(program.opts(), options));
    });

  program
    .command("claim")
    .description("claim staking rewards")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("-n,--nonce <nonce>", "Nonce of the constructed transaction")
    .option("-a, --amount <amount>", "Amount to claim (in FLR; default: all unclaimed)")
    .option("-r, --recipient <recipient>", "Address to send the rewards to")
    .option("-w, --wrap", "Wrap the rewards", false)
    .action(async (options: EvmTxOptions) => {
      await evmTransaction("claim", globalOptions(program.opts(), options));
    });

  program
    .command("setClaimExecutors")
    .description("Set claim executors for claiming FSP rewards")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .option(
      "--executors <executors...>",
      "Addresses of the executors to set (space separated); empty string to remove all executors"
    )
    .action(async (options: EvmTxOptions) => {
      await evmTransaction("setClaimExecutors", globalOptions(program.opts(), options));
    });

  program
    .command("setAllowedClaimRecipients")
    .description("Set allowed claim recipients for claiming FSP rewards")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .option(
      "--recipients <recipients...>",
      "Addresses of the allowed claim recipients to set (space separated); empty string to remove all recipients"
    )
    .action(async (options: EvmTxOptions) => {
      await evmTransaction("setAllowedClaimRecipients", globalOptions(program.opts(), options));
    });

  program
    .command("customCChainTx")
    .description("Custom C-chain transaction")
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("--nonce <nonce>", "Nonce of the constructed transaction")
    .option("--data <data>", "Data to send in the transaction", "0x")
    .option("--to <to>", "Address to send the transaction to")
    .option("--value <value>", "Value to send in the transaction (in wei)", "0")
    .action(async (options: EvmTxOptions) => {
      await evmTransaction("custom", globalOptions(program.opts(), options));
    });
}

function reportResolvedTimes(times: { name: string; time: ParsedTime }[], fileFlow: boolean): void {
  for (const { name, time } of times) {
    const warning =
      name === END_TIME
        ? pastEndTimeWarning(time.value)
        : name === START_TIME
          ? START_TIME_NOT_USED_WARNING
          : undefined;
    if (warning) logWarning(warning);
    if (!time.relative) continue;
    logInfo(`${name}: ${time.value} (${new Date(Number(time.value) * 1000).toISOString()})`);
    if (fileFlow) {
      logInfo(
        "Every signer of this ForDefi transaction has to pass this absolute unix time, since durations are resolved against each machine's clock."
      );
    }
  }
}

async function transaction(type: string, options: GlobalOptions & AtomicTxOptions): Promise<void> {
  const env = resolveEnv(options);
  const signer = await resolveSigner(options, env);
  const { request, resolvedTimes } = parseAtomicTxRequest(type, options);
  reportResolvedTimes(resolvedTimes, signer.kind === "file");
  reportOutcome(await runTransaction(request, env, signer), env.network.symbol);
}

async function evmTransaction(
  operation: "withdrawal" | "claim" | "setClaimExecutors" | "setAllowedClaimRecipients" | "custom",
  options: GlobalOptions & EvmTxOptions
): Promise<void> {
  const env = resolveEnv(options);
  const signer = await resolveSigner(options, env);
  reportOutcome(await runTransaction(parseEvmTxRequest(operation, options), env, signer), env.network.symbol);
}

async function send(options: GlobalOptions): Promise<void> {
  const id = options.transactionId;
  if (!id) {
    throw new Error("send needs the transaction id: -i <id>");
  }
  const env = resolveEnv(options);
  const expected =
    options.ledger || options.envPath
      ? await resolveAccount(options, env)
      : contextFileExists(options.ctxFile)
        ? accountFromContextFile(readContextFile(options.ctxFile), env.network.hrp)
        : undefined;
  const { txId } = await sendSignedTransaction(id, env, expected);
  logSuccess(`Signed transaction ${id} with hash ${txId} sent to the node`);
}

async function forDefi(type: string, options: GlobalOptions): Promise<void> {
  const id = options.transactionId;
  if (!id) {
    throw new Error("forDefi needs the transaction id: -i <id>");
  }
  if (type === "sign") {
    const forDefiTxId = await sendToForDefi(id, readContextFile(options.ctxFile));
    logSuccess(`Transaction ${id} sent to ForDefi (ForDefi transaction id ${forDefiTxId})`);
  } else if (type === "fetch") {
    if (isAlreadySentToChain(id)) {
      throw new Error("Tx already sent to chain");
    }
    const signature = await fetchForDefiSignature(id);
    logSuccess(`Success! Signature: ${signature}`);
  } else {
    throw new Error(`Unknown forDefi action ${type}; use sign or fetch`);
  }
}

async function initCtx(options: GlobalOptions & InitCtxOptions): Promise<void> {
  const network = resolveNetworkName(options.network, options.ctxFile);
  const env = resolveEnv({ ...options, network });
  const vaultId = typeof options.vaultId === "string" ? options.vaultId : undefined;
  let context: ContextFile;
  if (options.ledger) {
    const device = ledgerDevice();
    const publicKey = await device.getPublicKey(options.derivationPath, env.network.hrp);
    const account = accountFromPublicKey(publicKey, env.network.hrp);
    if (!process.env[FAKE_LEDGER_KEY_ENV]) {
      await ledger.verifyCAddress(options.derivationPath);
    }
    context = {
      wallet: "ledger",
      publicKey,
      ethAddress: account.cAddress,
      flareAddress: account.pAddress,
      network,
      derivationPath: options.derivationPath,
      ...(vaultId ? { vaultId } : {}),
    };
  } else if (typeof options.publicKey === "string") {
    const publicKey = options.publicKey;
    const account = accountFromPublicKey(publicKey, env.network.hrp); // throws on an invalid key: exit code 1
    context = {
      wallet: "publicKey",
      publicKey,
      network,
      ethAddress: account.cAddress,
      flareAddress: account.pAddress,
      ...(vaultId ? { vaultId } : {}),
    };
  } else {
    throw new Error("Either --ledger or --public-key must be specified");
  }
  writeContextFile(context, options.ctxFile);
  logSuccess("Context file created");
}

const INFO_TYPES = ["addresses", "balance", "validators"];

async function info(type: string, options: GlobalOptions): Promise<void> {
  if (!INFO_TYPES.includes(type)) {
    throw new Error(`Unknown information type "${type}"; use ${INFO_TYPES.join(", ")}`);
  }
  const env = resolveEnv(options);
  if (type === "validators") {
    const validators = await getValidators(env);
    logInfo(`Validators on the network "${env.network.name}"`);
    log(JSON.stringify(validators, null, 2));
    for (const validator of validators) {
      const summary = describeAutoRenewal(validator);
      if (summary) log(`${validator.nodeID}: ${summary}`);
    }
    return;
  }
  const account = await resolveAccount(options, env);
  if (type === "addresses") {
    logInfo(`Addresses on the network "${env.network.name}"`);
    log(`P-chain address: ${account.pAddress}`);
    log(`C-chain address hex: ${account.cAddress}`);
    log(`secp256k1 public key: 0x${account.publicKeyHex}`);
  } else if (type === "balance") {
    const balances = await getBalances(env, account);
    logInfo(`Balances on the network "${env.network.name}"`);
    log(`C-chain ${account.cAddress}: ${formatWei(balances.cChainWei)} ${env.network.symbol}`);
    log(`P-chain ${account.pAddress}: ${formatFlr(balances.pChainNFlr)} ${env.network.symbol}`);
  }
}
