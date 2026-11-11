/**
 * Commander definitions. Each action parses its options into a typed request,
 * resolves the environment and the signer, and calls the application layer;
 * no transaction logic lives here.
 */
import { Argument, Command } from "commander";
import { styleText } from "node:util";
import figlet from "figlet";
import { accountFromPublicKey } from "./chain/keys";
import { NETWORK_NAMES, overriddenNode } from "./chain/network";
import { formatFlr, formatWei } from "./chain/units";
import { ATOMIC_TX_TYPES } from "./core/types";
import { isAlreadySentToChain } from "./core/files";
import { createEnv, readContextFile, resolveNetworkName, writeContextFile, type ContextFile } from "./app/env";
import { fetchForDefiSignature, sendToForDefi } from "./app/fordefi";
import { describeAutoRenewal, getBalances, getValidators } from "./app/info";
import { sendSignedTransaction } from "./app/send";
import { runTransaction } from "./app/transactions";
import {
  BASE_DERIVATION_PATH,
  DEFAULT_DELEGATION_FEE_PERCENT,
  END_TIME,
  START_TIME,
  START_TIME_NOT_USED_WARNING,
  evmFeeOverrides,
  endTimeWarnings,
  millisecondsWarning,
  type ParsedTime,
} from "./cli/inputs";
import {
  contextFileApplies,
  globalOptions,
  requireGivenContextFile,
  resolveAccount,
  resolveEnv,
  resolveSigner,
  selectsAccount,
  type GlobalOptions,
} from "./cli/options";
import {
  parseAtomicTxRequest,
  parseEvmTxRequest,
  refuseUnusedOptions,
  type AtomicTxOptions,
  type EvmTxOptions,
} from "./cli/requests";
import { API_KEY_DESCRIPTION, API_KEY_OPTION, RPC_URL_DESCRIPTION, RPC_URL_OPTION, nodeOverrides } from "./cli/node";
import { interactiveCli } from "./interactive/cli";
import { checkDerivationPath } from "./ledger/path";
import { log, logInfo, logSuccess, logWarning, reportOutcome } from "./output";
import { confirmLedgerAccount, ledgerDevice } from "./signers/ledger";
import { version } from "../package.json";

const TRANSACTION_TYPES = ATOMIC_TX_TYPES.join("|");
/** Commander refuses other values (Argument.choices); the commands keep their own checks for other callers. */
const INFO_TYPES = ["addresses", "balance", "validators"];
const FORDEFI_ACTIONS = ["sign", "fetch"];

/** Options of `init-ctx`. */
interface InitCtxOptions {
  publicKey?: string;
  vaultId?: string;
}

/** The program's C-chain fee options, which only the C-chain commands read. */
const EVM_FEE_OPTIONS = ["maxFeePerGas", "priorityFeePerGas", "gasLimit"];

/** The long flags of the options of `command` given on the command line, of those named in `only` when given. */
function givenFlags(command: Command, only?: readonly string[]): string[] {
  return command.options
    .filter((option) => only === undefined || only.includes(option.attributeName()))
    .filter((option) => command.getOptionValueSource(option.attributeName()) === "cli")
    .flatMap((option) => (option.long === undefined ? [] : [option.long]));
}

/** Options of `send` and `forDefi`. */
type TransactionIdOptions = Pick<GlobalOptions, "transactionId">;

export function cli(program: Command): void {
  // each command's help lists the program's options too (--network, --ledger, the fee options, ...), which it takes;
  // the commands defined below inherit this
  program.configureHelp({ showGlobalOptions: true });
  program
    .option("--network <network>", `Network name (${NETWORK_NAMES.join("|")})`)
    .option(RPC_URL_OPTION, RPC_URL_DESCRIPTION)
    .option(API_KEY_OPTION, API_KEY_DESCRIPTION)
    .option("--ledger", "Use ledger to sign transactions")
    .option("--blind", "Blind signing (accepted for compatibility; signing mode is chosen automatically)", true)
    .option(
      "--derivation-path <derivation-path>",
      `Ledger address derivation path (default: a Ledger context file's, else ${BASE_DERIVATION_PATH})`
    )
    .option("--ctx-file <file>", "Context file as returned by init-ctx (default: ctx.json)")
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
    .description("Interactive mode (also -i)")
    .action(async () => {
      const given = NOT_INTERACTIVE_OPTIONS.filter(([key]) => program.getOptionValueSource(key) === "cli");
      await interactive(
        globalOptions(program.opts()),
        given.map(([, flag]) => flag)
      );
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
    .addArgument(new Argument("<addresses|balance|validators>", "Type of information").choices(INFO_TYPES))
    .action(async (type: string) => {
      await info(type, globalOptions(program.opts()));
    });

  program
    .command("transaction")
    .description("Move funds between chains or P-chain addresses, stake, delegate, manage auto-renewed validators")
    .addArgument(new Argument(`<${TRANSACTION_TYPES}>`, "Type of transaction").choices(ATOMIC_TX_TYPES))
    .option("-i, --transaction-id <transaction-id>", "Id of the transaction to finalize (unsigned-file flow)")
    .option("-a, --amount <amount>", "Amount (in FLR)")
    .option("-f, --fee <fee>", "Transaction fee (in FLR; exportCP/importPC)")
    .option("-n, --node-id <nodeId>", "The id of the node to stake/delegate to")
    .option("-s, --start-time <start-time>", "Start time (unix seconds or duration from now)")
    .option("-e, --end-time <end-time>", "End time (unix seconds or duration from now, e.g. 2d12h)")
    .option("--nonce <nonce>", "C-chain nonce of the constructed transaction (exportCP)")
    .option(
      "--delegation-fee <delegation-fee>",
      "Delegation fee in percent charged by the validator",
      DEFAULT_DELEGATION_FEE_PERCENT
    )
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
      "P-chain address allowed to change the auto-renew config (one address; default: own address)"
    )
    .option(
      "--validator-tx-id <txID>",
      "Transaction id of the auto-renewed validator to reconfigure (alternative to --node-id)"
    )
    .option("--threshold <threshold>", "Accepted for compatibility; only 1", "1")
    .action(async (type: string, options: AtomicTxOptions, command: Command) => {
      refuseUnusedOptions(type, [...givenFlags(command), ...givenFlags(program, EVM_FEE_OPTIONS)]);
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
    .addArgument(new Argument("<sign|fetch>", "Type of a forDefi transaction").choices(FORDEFI_ACTIONS))
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
    const warnings =
      name === END_TIME
        ? endTimeWarnings(time)
        : name === START_TIME
          ? [millisecondsWarning(START_TIME, time), START_TIME_NOT_USED_WARNING]
          : [];
    for (const warning of warnings) if (warning) logWarning(warning);
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
  // the request first: a missing or invalid option is reported as such, not as a missing signer or transaction id
  const { request, resolvedTimes } = parseAtomicTxRequest(type, options);
  const signer = await resolveSigner(options, env);
  reportResolvedTimes(resolvedTimes, signer.kind === "file");
  reportOutcome(await runTransaction(request, env, signer), env.network.symbol);
}

async function evmTransaction(
  operation: "withdrawal" | "claim" | "setClaimExecutors" | "setAllowedClaimRecipients" | "custom",
  options: GlobalOptions & EvmTxOptions
): Promise<void> {
  const env = resolveEnv(options);
  const request = parseEvmTxRequest(operation, options); // before the signer, as for transactions
  const signer = await resolveSigner(options, env);
  reportOutcome(await runTransaction(request, env, signer), env.network.symbol);
}

async function send(options: GlobalOptions): Promise<void> {
  const id = options.transactionId;
  if (!id) {
    throw new Error("send needs the transaction id: -i <id>");
  }
  const env = resolveEnv(options);
  // the signature is checked against the account the options select, as info and transactions choose it (a given
  // --ctx-file must exist); with no selector and no context file there is nothing to check it against, and the
  // account is the one that signed
  const expected =
    selectsAccount(options) || contextFileApplies(options) ? await resolveAccount(options, env) : undefined;
  const { txId } = await sendSignedTransaction(id, env, expected);
  logSuccess(`Signed transaction ${id} with hash ${txId} sent to the node`);
}

async function forDefi(type: string, options: GlobalOptions): Promise<void> {
  const id = options.transactionId;
  if (!id) {
    throw new Error("forDefi needs the transaction id: -i <id>");
  }
  requireGivenContextFile(options); // fetch does not read the context, but a given one must still exist
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

/**
 * Global options interactive mode has no use for: it asks for the wallet and the network itself, and keeps a Ledger
 * context in ./ctx.json. They are refused rather than ignored.
 */
const NOT_INTERACTIVE_OPTIONS = [
  ["network", "--network"],
  ["ledger", "--ledger"],
  ["blind", "--blind"],
  ["derivationPath", "--derivation-path"],
  ["ctxFile", "--ctx-file"],
  ["envPath", "--env-path"],
  ["getHacked", "--get-hacked"],
] as const;

/**
 * Starts the menu. Commander has handled --help and refused unknown options by now; the options interactive mode
 * doesn't use (`ignored`, the ones given), the fee options and the node URL are checked before anything is shown, and
 * the menu needs a terminal, as the prompts read keystrokes from one.
 */
async function interactive(options: GlobalOptions, ignored: readonly string[]): Promise<void> {
  if (ignored.length > 0) {
    throw new Error(
      `interactive mode asks for the wallet and network itself; leave out ${ignored.join(", ")} ` +
        "(it uses --rpc-url, --api-key and the C-chain fee options)"
    );
  }
  const settings = { node: nodeOverrides(options), evmFees: evmFeeOverrides(options) };
  overriddenNode(settings.node); // a bad --rpc-url fails now, not after the wallet questions
  if (!process.stdin.isTTY) {
    // without a terminal inquirer would crash after the first question
    throw new Error("interactive mode needs a terminal; use the commands instead (see --help)");
  }
  process.stdout.write("\x1Bc");
  console.log(styleText("white", figlet.textSync("Flare Stake CLI")));
  console.log(styleText("green", `Version: ${version}`));
  await interactiveCli(settings);
  console.log("Finished execution");
}

async function initCtx(options: GlobalOptions & InitCtxOptions): Promise<void> {
  if (options.ledger && typeof options.publicKey === "string") {
    // the Ledger's key used to be saved silently
    throw new Error("init-ctx takes --ledger or --public-key, not both");
  }
  const network = resolveNetworkName(options.network, options.ctxFile);
  const env = createEnv(network, nodeOverrides(options)); // not resolveEnv: --ctx-file is the file to write
  const vaultId = typeof options.vaultId === "string" ? options.vaultId : undefined;
  let context: ContextFile;
  if (options.ledger) {
    const derivationPath = checkDerivationPath(options.derivationPath ?? BASE_DERIVATION_PATH, "--derivation-path");
    const { publicKey, account } = await confirmLedgerAccount(ledgerDevice(), derivationPath, env.network.hrp);
    context = {
      wallet: "ledger",
      publicKey,
      ethAddress: account.cAddress,
      flareAddress: account.pAddress,
      network,
      derivationPath,
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
