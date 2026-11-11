/**
 * Interactive mode, scripted: runs the built menu (dist/) through every task
 * and wallet flow with the answers below, and prints a transcript to stdout.
 * Run by interactive.test.ts in a child process, because it replaces module
 * exports of dist/, the clock, console and the working directory.
 *
 * inquirer.prompt answers from the script, and every call that would reach a
 * node or a device is replaced. The transcript holds what a user sees and what
 * the tool does: each question (type, styled message, default, choice labels),
 * each answer, each validation message, everything printed, each request
 * handed to runTransaction and the files left behind. Internal details such as
 * answer keys are not recorded, so a refactor that keeps the behaviour keeps
 * the transcript.
 */
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { stripVTControlCharacters } from "util";
import type InquirerModule from "inquirer";
import type * as EnvModule from "../../src/app/env";
import type * as InfoModule from "../../src/app/info";
import type * as TransactionsModule from "../../src/app/transactions";
import type * as ClientsModule from "../../src/chain/clients";
import type * as ContractsModule from "../../src/chain/contracts";
import type * as NetworkModule from "../../src/chain/network";
import type { NFlr, Wei } from "../../src/chain/units";
import type * as ValidatorsModule from "../../src/chain/validators";
import type * as PchainModule from "../../src/core/builders/pchain";
import type { BuiltDetails } from "../../src/core/details";
import type { TxRequest } from "../../src/core/types";
import type * as InteractiveModule from "../../src/interactive/cli";
import type * as LedgerSignerModule from "../../src/signers/ledger";
import type { LedgerDevice } from "../../src/signers/ledger";
import { SigningKey, computeAddress, keccak256, toUtf8Bytes } from "ethers";
import { EWOQ_P_ADDRESS, EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { NODE_A_POP, NODE_B_POP } from "../helpers/bls";

const DIST = path.resolve(__dirname, "..", "..", "dist");
const load = createRequire(__filename);
const fromDist = <T>(module: string): T => load(path.join(DIST, module)) as T;

const lines: string[] = [];
const record = (line: string): void => {
  lines.push(line);
};
const show = (value: unknown): string =>
  JSON.stringify(value, (_key, x: unknown) =>
    typeof x === "bigint" ? `${x}n` : x instanceof Uint8Array ? `0x${Buffer.from(x).toString("hex")}` : x
  );
const write = process.stdout.write.bind(process.stdout);

Date.now = () => 1_800_000_000_000;
for (const method of ["log", "error", "info", "warn"] as const) {
  console[method] = (...args: unknown[]) => record(`[${method}] ${args.map(String).join(" ")}`);
}

/** Replaces an export of a dist module; refuses one that no longer exists, so that a moved function fails loudly. */
function stub<M extends object, K extends keyof M & string>(module: M, name: K, replacement: M[K]): void {
  if (typeof module[name] !== "function") throw new Error(`dist module has no function ${name} to replace`);
  Object.assign(module, { [name]: replacement });
}

// ---- the scenario being run ----

interface Flags {
  /** runTransaction refuses the first request of each of these types. */
  failTx?: string[];
  /** runTransaction has the node take the first request of each of these types, then fails to read its status. */
  failAfterIssue?: string[];
  /** runTransaction fails to build the first request of each of these types, before its summary is shown. */
  failBuild?: string[];
  /**
   * Those refusals, and a failure of the first wallet connection, are a node's answer that starts with the API key
   * and fails to parse as JSON (V8 quotes its start), noted with a node URL holding a password: what is printed must
   * be cleaned of both, as describeError cleans it.
   */
  nodeErrors?: boolean;
  /** No fee estimate (nothing to estimate). */
  noEstimate?: boolean;
  /** No exportPC default (node unreachable). */
  noMax?: boolean;
  zeroRewards?: boolean;
  /** The validator's cycle end cannot be looked up. */
  noCycle?: boolean;
  /** The node is on another network than the one chosen. */
  wrongNetwork?: boolean;
  /** The Ledger answers one key whatever the path, like the FLARE_FAKE_LEDGER_KEY stand-in. */
  sameKey?: boolean;
  /** Another Ledger is plugged in when a question with this text is asked: from then on every path answers another key. */
  swapLedgerAt?: string;
  /** Another Ledger is plugged in after this many reads of the device, between two reads no question separates. */
  swapLedgerAfterReads?: number;
  /**
   * An earlier export is still pending on both chains, and a new export's UTXO shows up only on the second look,
   * so a move must wait for its own.
   */
  earlierExport?: boolean;
}
type Answer = string | boolean | { index: number };

let script: Answer[] = [];
let flags: Flags = {};
let exhausted = 0;
let txCount = 0;
let ledgerSwapped = false;
let deviceReads = 0;
/** How often the pending UTXOs were read since the last transaction. */
let utxoReads = 0;

// ---- inquirer ----

interface Choice {
  name: string;
  value?: unknown;
}
interface Question {
  type: string;
  name: string;
  message: string;
  default?: unknown;
  choices?: (string | Choice)[];
  filter?: (value: unknown, answers: object) => unknown;
  validate?: (value: unknown, answers: object) => unknown;
}

const labelOf = (choice: string | Choice): string => (typeof choice === "string" ? choice : choice.name);
const valueOf = (choice: string | Choice): unknown =>
  typeof choice === "string" ? choice : "value" in choice ? choice.value : choice.name;

function nextAnswer(): Answer {
  const answer = script.shift();
  if (answer !== undefined) return answer;
  exhausted++;
  if (exhausted > 3) {
    record("!! script exhausted repeatedly; aborting");
    write(lines.join("\n") + "\n");
    process.exit(2);
  }
  throw new Error("SCRIPT EXHAUSTED");
}

async function prompt(questions: Question[]): Promise<Record<string, unknown>> {
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const choices = q.choices;
    if (flags.swapLedgerAt !== undefined && q.message.includes(flags.swapLedgerAt)) ledgerSwapped = true;
    record(
      `? ${q.type} ${show(q.message)}` +
        (q.default !== undefined ? ` default=${show(q.default)}` : "") +
        (choices ? ` choices=${show(choices.map(labelOf))}` : "")
    );
    for (;;) {
      const given = nextAnswer();
      record(`> ${show(given)}`);
      let value: unknown;
      if (q.type === "list") {
        const choice =
          typeof given === "object"
            ? choices?.[given.index]
            : choices?.find((c) => stripVTControlCharacters(labelOf(c)).startsWith(String(given)));
        if (!choice) throw new Error(`no choice ${show(given)} in ${show(choices?.map(labelOf))}`);
        value = valueOf(choice);
      } else if (q.type === "confirm") {
        value = given === "" ? q.default : given;
      } else {
        value = given === "" && q.default !== undefined ? q.default : given;
      }
      if (q.filter) value = await q.filter(value, answers);
      if (q.validate) {
        const verdict = await q.validate(value, answers);
        if (verdict !== true) {
          record(`  ! ${String(verdict)}`);
          continue;
        }
      }
      answers[q.name] = value;
      break;
    }
  }
  return answers;
}

const inquirer = load(load.resolve("inquirer", { paths: [path.join(DIST, "interactive")] })) as typeof InquirerModule;
Object.assign(inquirer, { prompt });

// ---- node and device ----

const { networkConfig, rememberSecret } = fromDist<typeof NetworkModule>("chain/network.js");
const { notingNode } = fromDist<typeof ClientsModule>("chain/clients.js");

const API_KEY = "k7Qz2LmN9pXy4RtV";
/** The error a node client throws for an answer that is not JSON and starts with the key, noted with the node. */
function nodeAnswerError(): Error {
  rememberSecret(API_KEY); // as createClients does with the key it sends
  const node = notingNode(
    { answer: () => JSON.parse(`${API_KEY} is not authorised`) as unknown },
    `http://user:${API_KEY}@127.0.0.1:9650`
  );
  try {
    node.answer();
  } catch (error) {
    return error as Error;
  }
  throw new Error("the answer parsed");
}

/** Only the client calls interactive mode makes itself; everything else goes through the stubs below. */
const fakeClients = () => {
  // a pending UTXO as allUtxos and the wait for an export read it: its own id and its export's tx id
  const utxo = (txId: string) => ({ ID: () => `${txId}-0`, utxoId: { txID: { toString: () => txId } } });
  const getUTXOs = (chain: string) => (query: unknown) => {
    utxoReads++;
    const latest = `tx${txCount}`;
    const txIds = flags.earlierExport ? ["tx-earlier", ...(utxoReads > 1 ? [latest] : [])] : [latest];
    record(`UTXOS ${chain} ${show(query)} -> ${txIds.join(", ")}`);
    return Promise.resolve({ numFetched: txIds.length, utxos: txIds.map(utxo), endIndex: { address: "", utxo: "" } });
  };
  return {
    verifyNetwork: () => {
      record("NODE verifyNetwork");
      return flags.wrongNetwork
        ? Promise.reject(new Error("The node is on network 14 (flare), not on localflare (162)"))
        : Promise.resolve();
    },
    pvm: { getUTXOs: getUTXOs("P") },
    evm: { getUTXOs: getUTXOs("C") },
  };
};

const envModule = fromDist<typeof EnvModule>("app/env.js");
let connections = 0;
stub(envModule, "createEnv", (network, node = {}) => {
  record(`ENV ${network} ${show(node)}`);
  if (flags.nodeErrors && connections++ === 0) throw nodeAnswerError();
  return { network: networkConfig(network, {}, node), clients: fakeClients() } as unknown as ReturnType<
    typeof EnvModule.createEnv
  >;
});

/** What the pipeline would read from the built transaction, for the summary shown before signing. */
function builtDetailsOf(request: TxRequest): BuiltDetails {
  switch (request.type) {
    case "exportCP":
      return { fee: request.fee ?? (1_234_000n as NFlr) };
    case "importPC":
      return { fee: request.fee ?? (1_234_000n as NFlr), imported: 2_998_766_000n as NFlr };
    case "importCP":
      return { fee: 1_234_000n as NFlr, imported: 2_998_766_000n as NFlr };
    case "claim":
      return {
        nonce: 7,
        value: 0n as Wei,
        maxGasCost: 75_000_000_000_000_000n as Wei,
        claimed: request.amount ?? ((5n * 10n ** 18n) as Wei),
      };
    case "withdrawal":
    case "setClaimExecutors":
    case "setAllowedClaimRecipients":
    case "customCChainTx":
      return { nonce: 7, value: 0n as Wei, maxGasCost: 75_000_000_000_000_000n as Wei };
    default:
      return { fee: 1_234_000n as NFlr };
  }
}

const transactions = fromDist<typeof TransactionsModule>("app/transactions.js");
stub(transactions, "runTransaction", async (request, _env, signer, confirm, beforeSign) => {
  await signer.account(); // as runTransaction does before building
  if (flags.failBuild?.includes(request.type)) {
    flags.failBuild = flags.failBuild.filter((type) => type !== request.type);
    throw new Error(`could not build ${request.type}`);
  }
  const details = builtDetailsOf(request);
  await beforeSign?.(details); // between building and signing; No throws
  record(`TX ${show(request)} signer=${signer.kind}`);
  if (flags.failTx?.includes(request.type)) {
    flags.failTx = flags.failTx.filter((type) => type !== request.type);
    throw flags.nodeErrors ? nodeAnswerError() : new Error(`node refused ${request.type}`);
  }
  if (flags.failAfterIssue?.includes(request.type)) {
    flags.failAfterIssue = flags.failAfterIssue.filter((type) => type !== request.type);
    const txId = `tx${++txCount}`;
    confirm?.onIssued?.(txId);
    throw new Error(`Transaction ${txId} was submitted, but its status could not be read: fetch failed`);
  }
  txCount++;
  utxoReads = 0;
  // the fee the summary showed, as the pipeline reports the one it read from the transaction
  return { status: "sent" as const, txId: `tx${txCount}`, chainStatus: "Committed", fee: details.fee };
});
stub(transactions, "estimateAtomicFee", (request) => {
  record(`ESTIMATE ${show(request)}`);
  return flags.noEstimate ? Promise.reject(new Error("nothing to estimate")) : Promise.resolve(22_460n as NFlr);
});

const info = fromDist<typeof InfoModule>("app/info.js");
stub(info, "getBalances", () =>
  Promise.resolve({ cChainWei: (5n * 10n ** 18n) as Wei, pChainNFlr: (3n * 10n ** 9n) as NFlr })
);
stub(info, "getValidators", () =>
  Promise.resolve([{ nodeID: "NodeID-A", endTime: "1800086400" }, { nodeID: "NodeID-B" }] as unknown as Awaited<
    ReturnType<typeof InfoModule.getValidators>
  >)
);
stub(info, "describeAutoRenewal", (v) => (v.nodeID === "NodeID-A" ? "auto-renews every 14d" : undefined));

stub(fromDist<typeof PchainModule>("core/builders/pchain.js"), "maxExportPCAmount", () =>
  flags.noMax ? Promise.reject(new Error("nothing to export")) : Promise.resolve(2_999_000_000n as NFlr)
);

const contracts = fromDist<typeof ContractsModule>("chain/contracts.js");
stub(contracts, "contractAddress", (_env, name) => {
  record(`CONTRACT ${name}`);
  return Promise.resolve("0x1111111111111111111111111111111111111111");
});
stub(contracts, "stateOfRewards", () =>
  Promise.resolve(
    flags.zeroRewards
      ? { totalWei: (10n ** 18n) as Wei, claimedWei: (10n ** 18n) as Wei, unclaimedWei: 0n as Wei }
      : {
          totalWei: (7n * 10n ** 18n) as Wei,
          claimedWei: (2n * 10n ** 18n) as Wei,
          unclaimedWei: (5n * 10n ** 18n) as Wei,
        }
  )
);

stub(fromDist<typeof ValidatorsModule>("chain/validators.js"), "currentValidators", (_env, ids) =>
  Promise.resolve(
    (flags.noCycle ? [] : (ids ?? []).map((id) => ({ nodeID: id, endTime: "1800086400" }))) as unknown as Awaited<
      ReturnType<typeof ValidatorsModule.currentValidators>
    >
  )
);

/** The key the device has at a path: another one once another Ledger is plugged in, the same everywhere with sameKey. */
function deviceKey(derivationPath: string): SigningKey {
  if (flags.swapLedgerAfterReads !== undefined && deviceReads++ >= flags.swapLedgerAfterReads) ledgerSwapped = true;
  return new SigningKey(
    keccak256(toUtf8Bytes((ledgerSwapped ? "another Ledger " : "") + (flags.sameKey ? "same" : derivationPath)))
  );
}

const fakeDevice: LedgerDevice = {
  detectApp: () => Promise.resolve("Flare"),
  getPublicKey: (derivationPath) => {
    record(`LEDGER getPublicKey ${derivationPath}`);
    return Promise.resolve(deviceKey(derivationPath).compressedPublicKey.slice(2));
  },
  signHash: () => Promise.reject(new Error("not used")),
  signTransaction: () => Promise.reject(new Error("not used")),
  signEvmTransaction: () => Promise.reject(new Error("not used")),
  showCAddress: (derivationPath) => {
    record(`LEDGER showCAddress ${derivationPath}`);
    return Promise.resolve(computeAddress(deviceKey(derivationPath)));
  },
};
stub(fromDist<typeof LedgerSignerModule>("signers/ledger.js"), "ledgerDevice", () => fakeDevice);

const { interactiveCli } = fromDist<typeof InteractiveModule>("interactive/cli.js");

// ---- scenarios ----

const TASK = {
  addresses: "View chain addresses",
  balance: "Check on-chain balance",
  validators: "Get validator info",
  CP: "Move assets from C-chain to P-chain",
  PC: "Move assets from P-chain to C-chain",
  import: "Import Funds",
  transfer: "Transfer funds",
  stake: "Add a validator node",
  delegate: "Delegate to a validator node",
  addARV: "Add an auto-renewed validator node",
  setARV: "Change the auto-renew period",
  claim: "Claim staking rewards",
  quit: "Quit",
};
const PRIVATE_KEY = ["Private Key", "pk", "LocalHost"];
/** The answer to "Sign and send this transaction?", asked after the summary of each built transaction. */
const SIGN = true;
const P_ADDRESS = EWOQ_P_ADDRESS;
const BLS_PUBLIC_KEY = NODE_A_POP.publicKey;
const BLS_SIGNATURE = NODE_A_POP.signature;
// node ids with valid checksums (the prompt refuses others), and one with its last character mistyped
const NODE_X = "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ";
const NODE_Y = "NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu";
const NODE_Z = "NodeID-NFBbbJ4qCmNaCzeW7sxErhvWqvEQMnYcN";
const NODE_X_MISTYPED = `${NODE_X.slice(0, -1)}Y`;

interface Scenario {
  name: string;
  /** What the command line gives the session (Commander parses it; see test/unit/cli-errors.test.ts). */
  options?: Partial<InteractiveModule.InteractiveOptions>;
  flags?: Flags;
  /** The ctx.json present at the start: the Ledger one an earlier scenario wrote, a ForDefi one, or an unusable one. */
  ctx?: "ledger" | "fordefi" | "unusable" | "stale";
  /** Keep the ctx.json this scenario writes for later scenarios. */
  keepLedgerCtx?: boolean;
  script: Answer[];
}

// prettier-ignore
const SCENARIOS: Scenario[] = [
  {
    name: "private key: every task",
    options: { evmFees: { maxFeePerGas: "300" } },
    script: [
      ...PRIVATE_KEY,
      TASK.addresses,
      TASK.balance,
      TASK.validators,
      TASK.CP, "10", "", SIGN, SIGN,
      TASK.PC, "", SIGN, "0.00000001", false, "0.00000001", true, SIGN,
      TASK.PC, "1.5", SIGN, "1", SIGN,
      TASK.import, "P", SIGN,
      TASK.import, "C", "0.5", SIGN,
      TASK.transfer, "1.5", P_ADDRESS, SIGN,
      TASK.stake, "10000", NODE_X.slice("NodeID-".length), NODE_X_MISTYPED, NODE_X, "2d", "", "zz", BLS_PUBLIC_KEY, "zz", NODE_B_POP.signature, BLS_SIGNATURE, SIGN,
      TASK.delegate, "50", NODE_X, "1700000000", SIGN,
      TASK.addARV, "10000", NODE_Y, "abc", "14d", "15", BLS_PUBLIC_KEY, BLS_SIGNATURE, SIGN,
      TASK.setARV, NODE_Y, "0", false,
      TASK.setARV, NODE_Y, "0", true, SIGN,
      TASK.setARV, NODE_Y, "7d", SIGN,
      TASK.claim, "Yes", "No", "", SIGN,
      TASK.claim, "No", "1,25", "0.0000000000000000001", "1.25", "Yes", "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC", SIGN,
      TASK.quit,
    ],
  },
  {
    name: "private key: errors keep the session",
    flags: { failTx: ["transfer"], noCycle: true },
    script: [
      "Private Key", "nofile",
      ...PRIVATE_KEY,
      TASK.transfer, "1", P_ADDRESS, SIGN,
      TASK.transfer, "abc", "0", "1", "P-costwo1qurswpc8qurswpc8qurswpc8qurswpc8f5jsg0", `C${P_ADDRESS.slice(1)}`, P_ADDRESS, SIGN,
      TASK.setARV, NODE_Z, "0", true, SIGN,
      TASK.quit,
    ],
  },
  {
    // the session prints errors as the command line does: without the input a JSON parse error quotes (the key's
    // start, which masking can't match), with the node and its credentials masked
    name: "private key: node errors are printed cleaned",
    flags: { failTx: ["transfer"], nodeErrors: true },
    script: [...PRIVATE_KEY, ...PRIVATE_KEY, TASK.transfer, "1", P_ADDRESS, SIGN, TASK.quit],
  },
  {
    // the rewards and the cycle end were read from the node, and shown, before any transaction checked its network
    name: "private key: a node on another network",
    flags: { wrongNetwork: true },
    script: [...PRIVATE_KEY, TASK.claim, TASK.setARV, NODE_Y, "0", TASK.quit],
  },
  {
    // connecting used to ask again after every error, with no way out but Ctrl-C
    name: "wallet menu: Quit after a failed connection",
    script: ["Private Key", "nofile", "Quit"],
  },
  {
    name: "private key: a failed export is not imported",
    flags: { failTx: ["exportCP", "exportPC"] },
    script: [...PRIVATE_KEY, TASK.CP, "10", "", SIGN, TASK.PC, "1", SIGN, TASK.quit],
  },
  {
    // an import the node took may still land: the funds wait only if it does not
    // approved, then taken by the node with its status unread, or failing with no answer: either may have landed
    name: "private key: an import approved but not confirmed",
    flags: { failAfterIssue: ["importCP"], failTx: ["importPC"] },
    script: [...PRIVATE_KEY, TASK.CP, "10", "", SIGN, SIGN, TASK.PC, "1", SIGN, "", SIGN, TASK.quit],
  },
  {
    // the error, and that the export was sent and its funds wait for "Import Funds"
    name: "private key: a failed import says the export was sent",
    flags: { failBuild: ["importCP", "importPC"] },
    script: [...PRIVATE_KEY, TASK.CP, "10", "0", "", SIGN, TASK.PC, "1", SIGN, "", TASK.quit],
  },
  {
    // No (also the default) signs nothing; a move whose export is not signed waits for nothing and imports nothing
    name: "private key: No to signing",
    // and a move whose import is declined says that its export was sent
    script: [
      ...PRIVATE_KEY, TASK.delegate, "50", NODE_X, "14d", false, TASK.CP, "10", "", "",
      TASK.CP, "10", "", SIGN, false, TASK.PC, "1.5", SIGN, "1", false, TASK.quit,
    ],
  },
  {
    name: "private key: a move waits for its own export, not an earlier one",
    flags: { earlierExport: true },
    script: [...PRIVATE_KEY, TASK.CP, "10", "", SIGN, SIGN, TASK.PC, "1", SIGN, "", SIGN, TASK.quit],
  },
  {
    name: "private key: no estimates, nothing to claim",
    flags: { noEstimate: true, noMax: true, zeroRewards: true },
    options: { node: { apiUrl: "http://127.0.0.1:1" }, evmFees: { gasLimit: "250000" } },
    script: [
      ...PRIVATE_KEY,
      TASK.CP, "1", "", SIGN, SIGN,
      TASK.PC, "2", SIGN, "", SIGN,
      TASK.import, "C", "", SIGN,
      TASK.claim,
      TASK.quit,
    ],
  },
  {
    name: "ledger: new context",
    keepLedgerCtx: true,
    script: ["Ledger", "Coston2", "Ledger Live", { index: 2 }, TASK.addresses, TASK.quit],
  },
  { name: "ledger: keep the context", ctx: "ledger", script: ["Ledger", "Yes", TASK.addresses, TASK.quit] },
  {
    // the address shown is the one of the saved key, which the session uses, not the cached ethAddress
    name: "ledger: a context with a stale cached address",
    ctx: "stale",
    script: ["Ledger", "Yes", TASK.addresses, TASK.quit],
  },
  {
    // the device answers the context's key to the check, then another Ledger's to the session's signer: the session
    // is refused rather than run for the other account (the signer is given the context's key to expect)
    name: "ledger: another Ledger plugged in right after the context check",
    ctx: "ledger",
    flags: { swapLedgerAfterReads: 1 },
    script: ["Ledger", "Yes", "Quit"],
  },
  {
    // the claim shows the first Ledger's account; the transaction is refused rather than built for the other one
    name: "ledger: another Ledger plugged in during the session",
    ctx: "ledger",
    flags: { swapLedgerAt: "What do you want to do?" },
    script: ["Ledger", "Yes", TASK.claim, "Yes", "No", "", TASK.quit],
  },
  {
    // the addresses listed are the first Ledger's: the device then shows the other one's, and nothing is saved
    // until an address of the Ledger now plugged in is chosen
    name: "ledger: another Ledger plugged in while choosing the address",
    flags: { swapLedgerAt: "Which address do you want to use?" },
    script: [
      "Ledger", "Coston2", "BIP44", { index: 0 },
      "Ledger", "Coston2", "BIP44", { index: 0 }, TASK.addresses, TASK.quit,
    ],
  },
  {
    // every path of this device answers another key than the one saved: kept (and refused), then replaced
    name: "ledger: a context from another Ledger",
    ctx: "ledger",
    flags: { sameKey: true },
    script: ["Ledger", "Yes", false, "Ledger", "Yes", true, "Coston2", "BIP44", { index: 0 }, TASK.addresses, TASK.quit],
  },
  {
    name: "ledger: replace the context",
    ctx: "ledger",
    script: ["Ledger", "No", "Coston ", "BIP44", { index: 0 }, TASK.addresses, TASK.quit],
  },
  {
    name: "ledger: one key for every path",
    flags: { sameKey: true },
    script: ["Ledger", "Coston2", "BIP44", { index: 2 }, TASK.addresses, TASK.quit],
  },
  {
    name: "ledger: a ForDefi context",
    ctx: "fordefi",
    script: ["Ledger", false, "Ledger", true, "Flare", "BIP44", { index: 1 }, TASK.addresses, TASK.quit],
  },
  {
    name: "ledger: an unusable context",
    ctx: "unusable",
    script: ["Ledger", true, "Songbird", "BIP44", { index: 9 }, TASK.addresses, TASK.quit],
  },
];

async function main(): Promise<void> {
  let ledgerCtx: string | undefined;
  for (const scenario of SCENARIOS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-"));
    process.chdir(dir);
    fs.writeFileSync("pk", `PRIVATE_KEY_HEX=${EWOQ_PRIVATE_KEY_HEX}\n`);
    if (scenario.ctx === "ledger" && ledgerCtx) fs.writeFileSync("ctx.json", ledgerCtx);
    if (scenario.ctx === "stale" && ledgerCtx) {
      const context = {
        ...(JSON.parse(ledgerCtx) as object),
        ethAddress: "0x000000000000000000000000000000000000dEaD",
      };
      fs.writeFileSync("ctx.json", JSON.stringify(context, null, 2));
    }
    if (scenario.ctx === "fordefi") {
      const context = { wallet: "publicKey", publicKey: "02" + "11".repeat(32), network: "costwo", vaultId: "v-1" };
      fs.writeFileSync("ctx.json", JSON.stringify(context));
    }
    if (scenario.ctx === "unusable") fs.writeFileSync("ctx.json", "{}");
    script = [...scenario.script];
    flags = { ...scenario.flags };
    exhausted = 0;
    connections = 0;
    txCount = 0;
    ledgerSwapped = false;
    deviceReads = 0;
    utxoReads = 0;
    record(`\n===== ${scenario.name}`);
    try {
      await interactiveCli({ node: {}, evmFees: {}, ...scenario.options });
      record("EXIT ok");
    } catch (error) {
      record(`EXIT error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (script.length > 0) record(`!! unused answers: ${show(script)}`);
    for (const file of fs.readdirSync(dir).sort()) {
      if (file !== "pk") record(`FILE ${file}: ${fs.readFileSync(path.join(dir, file), "utf8").trim()}`);
    }
    if (scenario.keepLedgerCtx) ledgerCtx = fs.readFileSync(path.join(dir, "ctx.json"), "utf8");
    process.chdir(os.tmpdir());
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const transcript = lines
    .join("\n")
    .replace(/ctx\.json\.\d{4}-\d\d-\d\dT[\d-]+Z\.bak/g, "ctx.json.<time>.bak")
    .trimStart();
  write(transcript + "\n");
}

main().catch((error: unknown) => {
  write(`${lines.join("\n")}\n!! ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
