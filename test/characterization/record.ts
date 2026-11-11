/**
 * Records the characterization fixtures and goldens against a live localflare node.
 *
 *   LOCALFLARE_RPC_URL=http://localhost:9650 pnpm test:record-fixtures [--only <substr>] [--from <name>] [--no-replay]
 *
 * Scenarios run in dependency order (an export before the matching import, the
 * Ledger stake before the delegations to that node) with every RPC call proxied
 * through the record server. Each scenario gets its own fixture + golden, so a
 * golden replays in isolation. After recording, every golden is replayed once
 * and compared, which proves the capture is deterministic.
 */
import fs from "fs";
import path from "path";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { cleanupTempDir, makeTempDir, REPO_ROOT, runCliAsync, writeEnvFile } from "../helpers/cli";
import { rpcCall, sleep } from "../helpers/rpc";
import { EWOQ_ETH_ADDRESS, EWOQ_P_ADDRESS, EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { RpcReplayServer } from "./rpc-replay";
import { evmContractStubs } from "./evm-stubs";
import {
  comparableOutcome,
  fixturePath,
  goldenPath,
  readGolden,
  runScenario,
  type Golden,
  type ScenarioAccount,
  type ScenarioOutcome,
  type ScenarioSpec,
} from "./scenarios";

const UPSTREAM = (process.env["LOCALFLARE_RPC_URL"] ?? "http://localhost:9650").replace(/\/+$/, "");
const NODE_URLS = (
  process.env["LOCALFLARE_NODE_URLS"] ??
  "http://localhost:9652,http://localhost:9654,http://localhost:9656,http://localhost:9658"
)
  .split(",")
  .map((u) => u.trim().replace(/\/+$/, ""));
const NETWORK = "localflare";
const EWOQ_C_BECH32 = `C-${EWOQ_P_ADDRESS.slice(2)}`;
const OTHER_P_ADDRESS = "P-localflare1g65uqn6t77p656w64023nh8nd9updzmxe63cr6"; // genesis allocation 1
const ENV = ["--env-path", "test.env", "--get-hacked"];
const NET = ["--network", NETWORK];
const START_TIME = "1700000000";

interface NodeInfo {
  url: string;
  nodeID: string;
  blsPublicKey: string;
  blsProofOfPossession: string;
}

interface Step {
  spec: ScenarioSpec;
  /** Waits for the chain to reflect the scenario before the next one runs. */
  settle?: (outcome: ScenarioOutcome) => Promise<void>;
  /**
   * Keep the C-chain producing blocks while the scenario runs. The EVM commands
   * wait for extra blocks after their transaction, and localflare only mines a
   * block when there is a transaction to include.
   */
  pump?: boolean;
}

/** A throwaway C-chain account that sends itself 1 wei in a loop to force blocks. */
class BlockPumper {
  private running = false;
  private loop: Promise<void> = Promise.resolve();
  private constructor(private readonly wallet: Wallet) {}

  static async fund(): Promise<BlockPumper> {
    const provider = new JsonRpcProvider(`${UPSTREAM}/ext/bc/C/rpc`, 162, { staticNetwork: true });
    const funder = new Wallet(EWOQ_PRIVATE_KEY_HEX, provider);
    const wallet = new Wallet(Wallet.createRandom().privateKey, provider);
    const funding = await funder.sendTransaction({ to: wallet.address, value: parseEther("10") });
    await funding.wait();
    return new BlockPumper(wallet);
  }

  start(): void {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        try {
          const tx = await this.wallet.sendTransaction({ to: this.wallet.address, value: 1n });
          await tx.wait();
        } catch (error: unknown) {
          console.warn(`block pumper: ${error instanceof Error ? error.message : String(error)}`);
        }
        await sleep(500);
      }
    })();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }
}

async function getNodeInfo(url: string): Promise<NodeInfo> {
  const result = await rpcCall<{ nodeID: string; nodePOP: { publicKey: string; proofOfPossession: string } }>(
    url,
    "/ext/info",
    "info.getNodeID"
  );
  return {
    url,
    nodeID: result.nodeID,
    blsPublicKey: result.nodePOP.publicKey,
    blsProofOfPossession: result.nodePOP.proofOfPossession,
  };
}

async function currentValidatorIds(): Promise<Set<string>> {
  const result = await rpcCall<{ validators: { nodeID: string }[] }>(
    UPSTREAM,
    "/ext/bc/P",
    "platform.getCurrentValidators",
    {}
  );
  return new Set(result.validators.map((v) => v.nodeID));
}

async function poll(description: string, check: () => Promise<boolean>, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(1_000);
  }
  throw new Error(`timed out waiting for ${description}`);
}

const waitForPendingImport = (destination: "P" | "C") =>
  poll(`atomic UTXO pending on ${destination}`, async () => {
    const result =
      destination === "P"
        ? await rpcCall<{ numFetched: string }>(UPSTREAM, "/ext/bc/P", "platform.getUTXOs", {
            addresses: [EWOQ_P_ADDRESS],
            sourceChain: "C",
          })
        : await rpcCall<{ numFetched: string }>(UPSTREAM, "/ext/bc/C/avax", "avax.getUTXOs", {
            addresses: [EWOQ_C_BECH32],
            sourceChain: "P",
          });
    return Number(result.numFetched) > 0;
  });

const waitForPTx = (outcome: ScenarioOutcome) =>
  poll(`P-chain tx ${outcome.txIds[0]} committed`, async () => {
    const status = await rpcCall<{ status: string }>(UPSTREAM, "/ext/bc/P", "platform.getTxStatus", {
      txID: outcome.txIds[0],
    });
    if (status.status === "Rejected" || status.status === "Dropped")
      throw new Error(`tx ${outcome.txIds[0]} ${status.status}`);
    return status.status === "Committed";
  });

const waitForCAtomicTx = (outcome: ScenarioOutcome) =>
  poll(`C-chain atomic tx ${outcome.txIds[0]} accepted`, async () => {
    const status = await rpcCall<{ status: string }>(UPSTREAM, "/ext/bc/C/avax", "avax.getAtomicTxStatus", {
      txID: outcome.txIds[0],
    });
    if (status.status === "Rejected") throw new Error(`tx ${outcome.txIds[0]} rejected`);
    return status.status === "Accepted";
  });

const waitForEvmTx = (outcome: ScenarioOutcome) =>
  poll(`EVM tx ${outcome.txIds[0]} mined`, async () => {
    const receipt = await rpcCall<{ status: string } | null>(UPSTREAM, "/ext/bc/C/rpc", "eth_getTransactionReceipt", [
      outcome.txIds[0],
    ]);
    return receipt !== null;
  });

/**
 * A throwaway account funded from ewoq on both chains, for scenarios whose
 * pre-flight checks depend on the account's existing stakes (ewoq validates
 * three nodes after the stake scenarios). The funding runs directly against the
 * node, not through the proxy, so it leaves no trace in the fixtures.
 */
async function freshFundedAccount(cFlr: string, pFlr: string): Promise<ScenarioAccount> {
  const provider = new JsonRpcProvider(`${UPSTREAM}/ext/bc/C/rpc`, 162, { staticNetwork: true });
  const funder = new Wallet(EWOQ_PRIVATE_KEY_HEX, provider);
  const wallet = new Wallet(Wallet.createRandom().privateKey, provider);
  await (await funder.sendTransaction({ to: wallet.address, value: parseEther(cFlr) })).wait();
  const account: ScenarioAccount = {
    privateKeyHex: wallet.privateKey.slice(2),
    publicKeyHex: wallet.signingKey.compressedPublicKey.slice(2),
  };
  const cwd = makeTempDir("fund-");
  try {
    const envPath = writeEnvFile(cwd, account.privateKeyHex);
    const env = { FLARE_RPC_URL: UPSTREAM, NO_COLOR: "1" };
    const direct = ["--get-hacked", "--env-path", envPath, ...NET];
    const exported = await runCliAsync(["transaction", "exportCP", "-a", pFlr, "-f", "1", ...direct], {
      cwd,
      env,
      timeoutMs: 120_000,
    });
    if (exported.exitCode !== 0) throw new Error(`funding exportCP failed: ${exported.stderr}`);
    await sleep(3_000);
    const imported = await runCliAsync(["transaction", "importCP", ...direct], { cwd, env, timeoutMs: 120_000 });
    if (imported.exitCode !== 0) throw new Error(`funding importCP failed: ${imported.stderr}`);
  } finally {
    cleanupTempDir(cwd);
  }
  return account;
}

function cli(name: string, args: string[], extra: Partial<ScenarioSpec> = {}): Step {
  return { spec: { name, kind: "cli", args, ...extra } };
}

function send(name: string, unsignedFrom: string, extra: Partial<ScenarioSpec> = {}): Step {
  return {
    spec: {
      name,
      kind: "send",
      args: ["send", "-i", unsignedFrom, ...NET],
      needsCtx: true,
      unsignedFrom,
      txFileId: unsignedFrom,
      ...extra,
    },
  };
}

function ledger(name: string, op: string, params: Record<string, string>): Step {
  return { spec: { name, kind: "ledger", args: [op, JSON.stringify(params)] } };
}

interface Options {
  only?: string;
  from?: string;
  replay: boolean;
}

async function buildSteps(options: Options): Promise<Step[]> {
  const validating = await currentValidatorIds();
  const allNodes = await Promise.all(NODE_URLS.map(getNodeInfo));
  const freeNodes = allNodes.filter((n) => !validating.has(n.nodeID));
  if (freeNodes.length < 3) {
    // Only the stake scenarios need three free nodes; pad so --from/--only runs of
    // other scenarios still work (a stake scenario on a validating node fails on the node).
    console.warn(`only ${freeNodes.length} non-validating node(s); the stake scenarios need 3`);
  }
  const nodes = [...freeNodes, ...allNodes.filter((n) => validating.has(n.nodeID))];
  if (nodes.length < 3) {
    throw new Error(`need at least 3 reachable nodes, found ${nodes.length}`);
  }
  const [ledgerNode, pkNode, fileNode] = nodes as [NodeInfo, NodeInfo, NodeInfo];
  // The Helicon scenarios need a node of their own: the fourth free one in a full run, or
  // the first free one when only they are recorded (--only/--from skip the stake scenarios).
  const heliconNode = freeNodes.length >= 4 ? freeNodes[3] : options.only || options.from ? freeNodes[0] : undefined;
  const now = Math.floor(Date.now() / 1000);
  const stakeEnd = String(now + 24 * 3600);
  const delegateEnd = String(now + 2 * 3600);
  const stakeArgs = (n: NodeInfo, fee = "10") => [
    "-n",
    n.nodeID,
    "-a",
    "10000",
    "-e",
    stakeEnd,
    "--delegation-fee",
    fee,
    "--pop-bls-public-key",
    n.blsPublicKey,
    "--pop-bls-signature",
    n.blsProofOfPossession,
  ];
  const delegateArgs = ["-n", ledgerNode.nodeID, "-a", "10000", "-e", delegateEnd];
  const fileTx = (name: string, type: string, args: string[], account?: ScenarioAccount) =>
    cli(name, ["transaction", type, ...args, "-i", name, ...NET], {
      needsCtx: true,
      txFileId: name,
      ...(account ? { account } : {}),
    });
  const pkTx = (
    name: string,
    type: string,
    args: string[],
    settle?: Step["settle"],
    account?: ScenarioAccount
  ): Step => ({
    ...cli(name, ["transaction", type, ...args, ...ENV, ...NET], { needsEnv: true, ...(account ? { account } : {}) }),
    ...(settle ? { settle } : {}),
  });
  const withSettle = (step: Step, settle: Step["settle"]): Step => ({ ...step, settle: settle! });

  async function heliconSteps(): Promise<Step[]> {
    if (!heliconNode || validating.has(heliconNode.nodeID)) return [];
    const wanted = (name: string) => !options.only || name.includes(options.only);
    if (
      !["addAutoRenewedValidator-pk", "setAutoRenewedValidatorConfig-file", "setAutoRenewedValidatorConfig-pk"].some(
        wanted
      )
    )
      return [];
    const account = await freshFundedAccount("100000", "50000");
    return [
      pkTx(
        "addAutoRenewedValidator-pk",
        "addAutoRenewedValidator",
        [
          "-n",
          heliconNode.nodeID,
          "-a",
          "10000",
          "--period",
          "15m",
          "--delegation-fee",
          "10",
          "--pop-bls-public-key",
          heliconNode.blsPublicKey,
          "--pop-bls-signature",
          heliconNode.blsProofOfPossession,
        ],
        waitForPTx,
        account
      ),
      fileTx(
        "setAutoRenewedValidatorConfig-file",
        "setAutoRenewedValidatorConfig",
        ["-n", heliconNode.nodeID, "--period", "20m"],
        account
      ),
      withSettle(
        send("send-setAutoRenewedValidatorConfig", "setAutoRenewedValidatorConfig-file", { account }),
        waitForPTx
      ),
      pkTx(
        "setAutoRenewedValidatorConfig-pk",
        "setAutoRenewedValidatorConfig",
        ["-n", heliconNode.nodeID, "--period", "0"],
        waitForPTx,
        account
      ),
    ];
  }

  return [
    cli("info-balance-pk", ["info", "balance", ...ENV, ...NET], { needsEnv: true }),
    cli("info-validators-pk", ["info", "validators", ...ENV, ...NET], { needsEnv: true }),

    // C → P, three paths (each import consumes every pending UTXO, so export/import pairs are interleaved)
    fileTx("exportCP-file", "exportCP", ["-a", "10", "-f", "1"]),
    withSettle(send("send-exportCP", "exportCP-file"), async () => waitForPendingImport("P")),
    fileTx("importCP-file", "importCP", []),
    withSettle(send("send-importCP", "importCP-file"), waitForPTx),
    pkTx("exportCP-pk", "exportCP", ["-a", "10", "-f", "1"], async () => waitForPendingImport("P")),
    pkTx("importCP-pk", "importCP", [], waitForPTx),
    ledger("exportCP-ledger", "exportCP", { amount: "10", fee: "1" }),
    ledger("importCP-ledger", "importCP", {}),
    fileTx("exportCP-file-nonce7", "exportCP", ["-a", "10", "-f", "1", "--nonce", "7"]),

    // P → C
    // exportPC amounts leave room for the 1 FLR total import fee of the file and Ledger paths
    fileTx("exportPC-file", "exportPC", ["-a", "10"]),
    withSettle(send("send-exportPC", "exportPC-file"), async () => waitForPendingImport("C")),
    fileTx("importPC-file", "importPC", ["-f", "1"]),
    withSettle(send("send-importPC", "importPC-file"), waitForCAtomicTx),
    pkTx("exportPC-pk", "exportPC", ["-a", "10"], async () => waitForPendingImport("C")),
    pkTx("importPC-pk", "importPC", ["-f", "1"], waitForCAtomicTx),
    ledger("exportPC-ledger", "exportPC", { amount: "10" }),
    ledger("importPC-ledger", "importPC", { fee: "1" }),

    // P → P
    fileTx("transfer-file", "transfer", ["-a", "1", "--transfer-address", OTHER_P_ADDRESS]),
    withSettle(send("send-transfer", "transfer-file"), waitForPTx),
    pkTx("transfer-pk", "transfer", ["-a", "1", "--transfer-address", OTHER_P_ADDRESS], waitForPTx),
    ledger("transfer-ledger", "transfer", { amount: "1", transferAddress: OTHER_P_ADDRESS }),

    // Staking: the Ledger path validates (max 3 nodes) and waits for the stake, so it goes first;
    // delegations target the node it added so the max-3-nodes rule is satisfied on every path.
    ledger("stake-ledger", "stake", {
      amount: "10000",
      nodeId: ledgerNode.nodeID,
      startTime: START_TIME,
      endTime: stakeEnd,
      delegationFee: "10",
      popBlsPublicKey: ledgerNode.blsPublicKey,
      popBlsSignature: ledgerNode.blsProofOfPossession,
    }),
    pkTx("stake-pk", "stake", [...stakeArgs(pkNode), "-s", START_TIME], waitForPTx),
    fileTx("stake-file", "stake", stakeArgs(fileNode)),
    withSettle(send("send-stake", "stake-file"), waitForPTx),
    fileTx("stake-file-fee2.5", "stake", stakeArgs(fileNode, "2.5")),
    ledger("delegate-ledger", "delegate", {
      amount: "10000",
      nodeId: ledgerNode.nodeID,
      startTime: START_TIME,
      endTime: delegateEnd,
    }),
    pkTx("delegate-pk", "delegate", [...delegateArgs, "-s", START_TIME], waitForPTx),
    fileTx("delegate-file", "delegate", delegateArgs),
    withSettle(send("send-delegate", "delegate-file"), waitForPTx),

    // C-chain EVM transactions (contract reads are stubbed; withdrawal/custom/claim really execute)
    cli("withdrawal-file", ["withdrawal", "-a", "1", "-t", EWOQ_ETH_ADDRESS, "-i", "withdrawal-file", ...NET], {
      needsCtx: true,
      txFileId: "withdrawal-file",
    }),
    { ...withSettle(send("send-withdrawal", "withdrawal-file", { evm: true }), waitForEvmTx), pump: true },
    cli(
      "withdrawal-file-nonce7",
      ["withdrawal", "-a", "1", "-t", EWOQ_ETH_ADDRESS, "--nonce", "7", "-i", "withdrawal-file-nonce7", ...NET],
      { needsCtx: true, txFileId: "withdrawal-file-nonce7" }
    ),
    cli(
      "customCChainTx-file",
      [
        "customCChainTx",
        "--to",
        EWOQ_ETH_ADDRESS,
        "--value",
        "1000000000000000000",
        "--data",
        "0x",
        "-i",
        "customCChainTx-file",
        ...NET,
      ],
      { needsCtx: true, txFileId: "customCChainTx-file" }
    ),
    { ...withSettle(send("send-customCChainTx", "customCChainTx-file", { evm: true }), waitForEvmTx), pump: true },
    cli("claim-file", ["claim", "-r", EWOQ_ETH_ADDRESS, "-i", "claim-file", ...NET], {
      needsCtx: true,
      txFileId: "claim-file",
    }),
    cli(
      "claim-file-amount-wrap",
      ["claim", "-r", EWOQ_ETH_ADDRESS, "-a", "1.5", "-w", "-i", "claim-file-amount-wrap", ...NET],
      { needsCtx: true, txFileId: "claim-file-amount-wrap" }
    ),
    cli(
      "claim-file-feeoverride",
      [
        "claim",
        "-r",
        EWOQ_ETH_ADDRESS,
        "--max-fee-per-gas",
        "9000",
        "--priority-fee-per-gas",
        "300",
        "--gas-limit",
        "700000",
        "-i",
        "claim-file-feeoverride",
        ...NET,
      ],
      { needsCtx: true, txFileId: "claim-file-feeoverride" }
    ),
    {
      ...cli("claim-pk", ["claim", "-r", EWOQ_ETH_ADDRESS, ...ENV, ...NET], { needsEnv: true }),
      settle: waitForEvmTx,
      pump: true,
    },
    cli(
      "setClaimExecutors-file",
      [
        "setClaimExecutors",
        "--executors",
        "0x000000000000000000000000000000000000aaaa",
        "0x000000000000000000000000000000000000bbbb",
        "-i",
        "setClaimExecutors-file",
        ...NET,
      ],
      { needsCtx: true, txFileId: "setClaimExecutors-file" }
    ),
    cli(
      "setClaimExecutors-file-empty",
      ["setClaimExecutors", "--executors", "", "-i", "setClaimExecutors-file-empty", ...NET],
      { needsCtx: true, txFileId: "setClaimExecutors-file-empty" }
    ),
    // Helicon (ACP-236): needs a free running node and a fresh account (ewoq already stakes to
    // three nodes after the stake scenarios). Skipped when no node is free.
    ...(await heliconSteps()),
    cli(
      "setAllowedClaimRecipients-file",
      [
        "setAllowedClaimRecipients",
        "--recipients",
        "0x000000000000000000000000000000000000cccc",
        "-i",
        "setAllowedClaimRecipients-file",
        ...NET,
      ],
      { needsCtx: true, txFileId: "setAllowedClaimRecipients-file" }
    ),
  ];
}

function parseOptions(argv: string[]): Options {
  const options: Options = { replay: true };
  const valueOf = (i: number, option: string): string => {
    const value = argv[i];
    if (value === undefined) throw new Error(`${option} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--only") options.only = valueOf(++i, arg);
    else if (arg === "--from") options.from = valueOf(++i, arg);
    else if (arg === "--no-replay") options.replay = false;
    else throw new Error(`unknown option ${String(arg)}`);
  }
  return options;
}

let pumper: BlockPumper | undefined;

async function recordStep(step: Step): Promise<Golden> {
  const server = await RpcReplayServer.start({
    mode: "record",
    fixturePath: fixturePath(step.spec.name),
    upstream: UPSTREAM,
    stubs: evmContractStubs,
  });
  const cwd = makeTempDir(`record-${step.spec.name}-`);
  if (step.pump) {
    if (!pumper) throw new Error("block pumper not funded");
    pumper.start();
  }
  try {
    const outcome = await runScenario(step.spec, {
      cwd,
      rpcUrl: server.url,
      unsignedFor: (producer) => readGolden(producer).outcome.unsignedTxJson,
      submissions: () => server.submissions,
    });
    if (outcome.exitCode !== 0) {
      throw new Error(
        `${step.spec.name} exited with ${outcome.exitCode}\nstdout: ${outcome.stdout}\nstderr: ${outcome.stderr}`
      );
    }
    server.save();
    const golden: Golden = { spec: step.spec, outcome };
    fs.mkdirSync(path.dirname(goldenPath(step.spec.name)), { recursive: true });
    fs.writeFileSync(goldenPath(step.spec.name), JSON.stringify(golden, null, 2) + "\n");
    if (step.settle) await step.settle(outcome);
    return golden;
  } finally {
    if (step.pump && pumper) await pumper.stop();
    await server.close();
    cleanupTempDir(cwd);
  }
}

async function replayStep(golden: Golden): Promise<string | undefined> {
  const server = await RpcReplayServer.start({
    mode: "replay",
    fixturePath: fixturePath(golden.spec.name),
    stubs: evmContractStubs,
  });
  const cwd = makeTempDir(`replay-${golden.spec.name}-`);
  try {
    const outcome = await runScenario(golden.spec, {
      cwd,
      rpcUrl: server.url,
      unsignedFor: (producer) => readGolden(producer).outcome.unsignedTxJson,
      submissions: () => server.submissions,
    });
    if (server.misses.length > 0) return `replay misses: ${server.misses.join(", ")}`;
    const unused = server.unused();
    if (unused.length > 0) return `recorded calls the command did not make in replay: ${unused.join(", ")}`;
    const expected = JSON.stringify(comparableOutcome(golden.outcome));
    const actual = JSON.stringify(comparableOutcome(outcome));
    return expected === actual
      ? undefined
      : `replay differs\nexpected: ${expected}\nactual:   ${actual}\nstderr: ${outcome.stderr}`;
  } finally {
    await server.close();
    cleanupTempDir(cwd);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!fs.existsSync(path.join(REPO_ROOT, "dist", "run.js"))) {
    throw new Error("dist/run.js missing: run `pnpm build` first");
  }
  const version = await rpcCall<{ version: string }>(UPSTREAM, "/ext/info", "info.getNodeVersion");
  console.log(`recording against ${UPSTREAM} (${version.version})`);

  let steps = await buildSteps(options);
  if (options.from) {
    const index = steps.findIndex((s) => s.spec.name === options.from);
    if (index < 0) throw new Error(`unknown scenario ${options.from}`);
    steps = steps.slice(index);
  }
  if (options.only) {
    const only = options.only;
    steps = steps.filter((s) => s.spec.name.includes(only));
  }

  // Fund the block pumper before any scenario builds a C-chain transaction: the
  // funding transaction comes from the ewoq key and bumps its nonce.
  if (steps.some((s) => s.pump)) {
    pumper = await BlockPumper.fund();
  }

  const recorded: Golden[] = [];
  for (const step of steps) {
    process.stdout.write(`▶ ${step.spec.name} ... `);
    const golden = await recordStep(step);
    console.log(`ok (${golden.outcome.txIds.join(", ") || "no tx"})`);
    recorded.push(golden);
  }

  if (options.replay) {
    console.log("\nreplaying recorded goldens to verify determinism");
    let failures = 0;
    for (const golden of recorded) {
      const problem = await replayStep(golden);
      console.log(`${problem ? "✗" : "✓"} ${golden.spec.name}${problem ? `\n  ${problem}` : ""}`);
      if (problem) failures++;
    }
    if (failures > 0) {
      throw new Error(`${failures} golden(s) did not replay deterministically`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
