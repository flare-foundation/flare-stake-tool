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
import type * as ContractsModule from "../../src/chain/contracts";
import type * as NetworkModule from "../../src/chain/network";
import type * as ValidatorsModule from "../../src/chain/validators";
import type * as PchainModule from "../../src/core/builders/pchain";
import type * as InteractiveModule from "../../src/interactive/cli";
import type * as LedgerSignerModule from "../../src/signers/ledger";
import type { LedgerDevice } from "../../src/signers/ledger";
import { SigningKey, keccak256, toUtf8Bytes } from "ethers";
import { EWOQ_P_ADDRESS, EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";

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
  /** No fee estimate (nothing to estimate). */
  noEstimate?: boolean;
  /** No exportPC default (node unreachable). */
  noMax?: boolean;
  zeroRewards?: boolean;
  /** The validator's cycle end cannot be looked up. */
  noCycle?: boolean;
  /** The Ledger answers one key whatever the path, like the FLARE_FAKE_LEDGER_KEY stand-in. */
  sameKey?: boolean;
}
type Answer = string | boolean | { index: number };

let script: Answer[] = [];
let flags: Flags = {};
let exhausted = 0;
let txCount = 0;

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

const { networkConfig } = fromDist<typeof NetworkModule>("chain/network.js");

/** Only the client calls interactive mode makes itself; everything else goes through the stubs below. */
const fakeClients = () => {
  const getUTXOs = (chain: string) => (query: unknown) => {
    record(`UTXOS ${chain} ${show(query)}`);
    return Promise.resolve({ utxos: [{}] });
  };
  return {
    verifyNetwork: () => (flags.noMax ? Promise.reject(new Error("unreachable")) : Promise.resolve()),
    pvm: { getUTXOs: getUTXOs("P") },
    evm: { getUTXOs: getUTXOs("C") },
  };
};

const envModule = fromDist<typeof EnvModule>("app/env.js");
stub(envModule, "createEnv", (network, node = {}) => {
  record(`ENV ${network} ${show(node)}`);
  return { network: networkConfig(network, {}, node), clients: fakeClients() } as unknown as ReturnType<
    typeof EnvModule.createEnv
  >;
});

const transactions = fromDist<typeof TransactionsModule>("app/transactions.js");
stub(transactions, "runTransaction", (request, _env, signer) => {
  record(`TX ${show(request)} signer=${signer.kind}`);
  if (flags.failTx?.includes(request.type)) {
    flags.failTx = flags.failTx.filter((type) => type !== request.type);
    return Promise.reject(new Error(`node refused ${request.type}`));
  }
  txCount++;
  const atomic = /^(export|import)/.test(request.type);
  return Promise.resolve({
    status: "sent" as const,
    txId: `tx${txCount}`,
    chainStatus: "Committed",
    ...(atomic ? { fee: 1_234_000n } : {}),
  });
});
stub(transactions, "estimateAtomicFee", (request) => {
  record(`ESTIMATE ${show(request)}`);
  return flags.noEstimate ? Promise.reject(new Error("nothing to estimate")) : Promise.resolve(22_460n);
});

const info = fromDist<typeof InfoModule>("app/info.js");
stub(info, "getBalances", () => Promise.resolve({ cChainWei: 5n * 10n ** 18n, pChainNFlr: 3n * 10n ** 9n }));
stub(info, "getValidators", () =>
  Promise.resolve([{ nodeID: "NodeID-A", endTime: "1800086400" }, { nodeID: "NodeID-B" }] as unknown as Awaited<
    ReturnType<typeof InfoModule.getValidators>
  >)
);
stub(info, "describeAutoRenewal", (v) => (v.nodeID === "NodeID-A" ? "auto-renews every 14d" : undefined));

stub(fromDist<typeof PchainModule>("core/builders/pchain.js"), "maxExportPCAmount", () =>
  flags.noMax ? Promise.reject(new Error("nothing to export")) : Promise.resolve(2_999_000_000n)
);

const contracts = fromDist<typeof ContractsModule>("chain/contracts.js");
stub(contracts, "contractAddress", (_env, name) => {
  record(`CONTRACT ${name}`);
  return Promise.resolve("0x1111111111111111111111111111111111111111");
});
stub(contracts, "stateOfRewards", () =>
  Promise.resolve(
    flags.zeroRewards
      ? { totalWei: 10n ** 18n, claimedWei: 10n ** 18n, unclaimedWei: 0n }
      : { totalWei: 7n * 10n ** 18n, claimedWei: 2n * 10n ** 18n, unclaimedWei: 5n * 10n ** 18n }
  )
);

stub(fromDist<typeof ValidatorsModule>("chain/validators.js"), "currentValidators", (_env, ids) =>
  Promise.resolve(
    (flags.noCycle ? [] : (ids ?? []).map((id) => ({ nodeID: id, endTime: "1800086400" }))) as unknown as Awaited<
      ReturnType<typeof ValidatorsModule.currentValidators>
    >
  )
);

const fakeDevice: LedgerDevice = {
  detectApp: () => Promise.resolve("Flare"),
  getPublicKey: (derivationPath) => {
    record(`LEDGER getPublicKey ${derivationPath}`);
    const seed = flags.sameKey ? "same" : derivationPath;
    return Promise.resolve(new SigningKey(keccak256(toUtf8Bytes(seed))).compressedPublicKey.slice(2));
  },
  signHash: () => Promise.reject(new Error("not used")),
  signTransaction: () => Promise.reject(new Error("not used")),
  signEvmTransaction: () => Promise.reject(new Error("not used")),
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
const P_ADDRESS = EWOQ_P_ADDRESS;
const BLS_PUBLIC_KEY = "0x" + "a1".repeat(48);
const BLS_SIGNATURE = "0x" + "b2".repeat(96);

interface Scenario {
  name: string;
  argv?: string[];
  flags?: Flags;
  /** The ctx.json present at the start: the Ledger one an earlier scenario wrote, a ForDefi one, or an unusable one. */
  ctx?: "ledger" | "fordefi" | "unusable";
  /** Keep the ctx.json this scenario writes for later scenarios. */
  keepLedgerCtx?: boolean;
  script: Answer[];
}

// prettier-ignore
const SCENARIOS: Scenario[] = [
  {
    name: "private key: every task",
    argv: ["interactive", "--max-fee-per-gas", "300"],
    script: [
      ...PRIVATE_KEY,
      TASK.addresses,
      TASK.balance,
      TASK.validators,
      TASK.CP, "10", "",
      TASK.PC, "", "0.00000001", false, "0.00000001", true,
      TASK.PC, "1.5", "1",
      TASK.import, "P",
      TASK.import, "C", "0.5",
      TASK.transfer, "1.5", P_ADDRESS,
      TASK.stake, "10000", "NodeID-X", "2d", "", "zz", BLS_PUBLIC_KEY, "zz", BLS_SIGNATURE,
      TASK.delegate, "50", "NodeID-X", "1700000000",
      TASK.addARV, "10000", "NodeID-Y", "abc", "14d", "15", BLS_PUBLIC_KEY, BLS_SIGNATURE,
      TASK.setARV, "NodeID-Y", "0", false,
      TASK.setARV, "NodeID-Y", "0", true,
      TASK.setARV, "NodeID-Y", "7d",
      TASK.claim, "Yes", "No", "",
      TASK.claim, "No", "1,25", "0.0000000000000000001", "1.25", "Yes", "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC",
      TASK.quit,
    ],
  },
  {
    name: "private key: errors keep the session",
    flags: { failTx: ["transfer"], noCycle: true },
    script: [
      "Private Key", "nofile",
      ...PRIVATE_KEY,
      TASK.transfer, "1", P_ADDRESS,
      TASK.transfer, "abc", "1", "P-costwo1qurswpc8qurswpc8qurswpc8qurswpc8f5jsg0", `C${P_ADDRESS.slice(1)}`, P_ADDRESS,
      TASK.setARV, "NodeID-Z", "0", true,
      TASK.quit,
    ],
  },
  {
    name: "private key: a failed export is not imported",
    flags: { failTx: ["exportCP", "exportPC"] },
    script: [...PRIVATE_KEY, TASK.CP, "10", "", TASK.PC, "1", TASK.quit],
  },
  {
    name: "private key: no estimates, nothing to claim",
    flags: { noEstimate: true, noMax: true, zeroRewards: true },
    argv: ["interactive", "--gas-limit", "250000", "--rpc-url", "http://127.0.0.1:1"],
    script: [...PRIVATE_KEY, TASK.CP, "1", "", TASK.PC, "2", "", TASK.import, "C", "", TASK.claim, TASK.quit],
  },
  {
    name: "ledger: new context",
    keepLedgerCtx: true,
    script: ["Ledger", "Coston2", "Ledger Live", { index: 2 }, TASK.addresses, TASK.quit],
  },
  { name: "ledger: keep the context", ctx: "ledger", script: ["Ledger", "Yes", TASK.addresses, TASK.quit] },
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
    if (scenario.ctx === "fordefi") {
      const context = { wallet: "publicKey", publicKey: "02" + "11".repeat(32), network: "costwo", vaultId: "v-1" };
      fs.writeFileSync("ctx.json", JSON.stringify(context));
    }
    if (scenario.ctx === "unusable") fs.writeFileSync("ctx.json", "{}");
    script = [...scenario.script];
    flags = { ...scenario.flags };
    exhausted = 0;
    txCount = 0;
    record(`\n===== ${scenario.name}`);
    try {
      await interactiveCli(scenario.argv ?? ["interactive"]);
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
