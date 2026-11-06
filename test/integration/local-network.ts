/**
 * Integration tests run against an externally started Helicon-capable localflare
 * (go-flare `avalanchego/scripts/localflare.sh`: five nodes on HTTP ports
 * 9650/9652/9654/9656/9658, network id 162, Helicon active at genesis). Nothing is
 * started or stopped here; the harness only checks readiness and picks nodes.
 *
 *   LOCALFLARE_RPC_URL    base URL of the node the CLI talks to (default http://localhost:9650)
 *   LOCALFLARE_NODE_URLS  comma-separated base URLs of all nodes, used to find a
 *                         node that is not validating yet for the stake tests
 */
import { randomBytes } from "crypto";
import { utils as futils } from "@flarenetwork/flarejs";
import { rpcCall, sleep } from "../helpers/rpc";

const trimSlash = (url: string): string => url.trim().replace(/\/+$/, "");

export const LOCAL_RPC_URL = trimSlash(process.env["LOCALFLARE_RPC_URL"] ?? "http://localhost:9650");
export const LOCAL_NODE_URLS = (
  process.env["LOCALFLARE_NODE_URLS"] ??
  "http://localhost:9650,http://localhost:9652,http://localhost:9654,http://localhost:9656,http://localhost:9658"
)
  .split(",")
  .map(trimSlash);

const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export interface NodeInfo {
  url: string;
  nodeID: string;
  blsPublicKey: string;
  blsProofOfPossession: string;
}

export interface UpgradesInfo {
  etnaTime?: string;
  heliconTime?: string;
  [key: string]: unknown;
}

async function isChainBootstrapped(chain: string): Promise<boolean> {
  try {
    const result = await rpcCall<{ isBootstrapped: boolean }>(LOCAL_RPC_URL, "/ext/info", "info.isBootstrapped", {
      chain,
    });
    return result.isBootstrapped;
  } catch {
    return false;
  }
}

/** Waits until P, X and C are bootstrapped on the node the CLI uses. */
export async function waitForLocalNetwork(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await Promise.all(["P", "X", "C"].map(isChainBootstrapped));
    if (ready.every(Boolean)) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `No bootstrapped localflare node at ${LOCAL_RPC_URL} within ${READY_TIMEOUT_MS}ms. ` +
      "Start one with go-flare's avalanchego/scripts/localflare.sh or set LOCALFLARE_RPC_URL."
  );
}

export async function getUpgrades(): Promise<UpgradesInfo> {
  return rpcCall<UpgradesInfo>(LOCAL_RPC_URL, "/ext/info", "info.upgrades");
}

export async function isHeliconActive(): Promise<boolean> {
  const { heliconTime } = await getUpgrades();
  return heliconTime !== undefined && new Date(heliconTime).getTime() <= Date.now();
}

export async function getNodeInfo(rpcUrl: string): Promise<NodeInfo> {
  const result = await rpcCall<{ nodeID: string; nodePOP: { publicKey: string; proofOfPossession: string } }>(
    rpcUrl,
    "/ext/info",
    "info.getNodeID"
  );
  return {
    url: rpcUrl,
    nodeID: result.nodeID,
    blsPublicKey: result.nodePOP.publicKey,
    blsProofOfPossession: result.nodePOP.proofOfPossession,
  };
}

export interface CurrentValidator {
  txID: string;
  nodeID: string;
  startTime: string;
  endTime: string;
  weight?: string;
  stakeAmount?: string;
  delegators?: { txID: string; nodeID: string; startTime: string; endTime: string }[];
  // Helicon (ACP-236) fields, present only for auto-renewed validators
  validatorAuthority?: { locktime: string; threshold: string; addresses: string[] };
  nextPeriod?: string;
  autoCompoundRewardShares?: string;
  [key: string]: unknown;
}

export async function getCurrentValidators(nodeIDs?: string[]): Promise<CurrentValidator[]> {
  const result = await rpcCall<{ validators: CurrentValidator[] }>(
    LOCAL_RPC_URL,
    "/ext/bc/P",
    "platform.getCurrentValidators",
    nodeIDs ? { nodeIDs } : {}
  );
  return result.validators;
}

/**
 * Returns the first running node (other than the one the CLI uses) that is not a
 * current validator, or undefined when every node is validating; tests should
 * `this.skip()` in that case, because a validator cannot be added twice and the
 * minimum staking period on localflare is 15 minutes.
 */
export async function pickFreeNode(exclude: string[] = []): Promise<NodeInfo | undefined> {
  const validating = new Set((await getCurrentValidators()).map((v) => v.nodeID));
  for (const url of LOCAL_NODE_URLS.filter((u) => u !== LOCAL_RPC_URL)) {
    const node = await getNodeInfo(url);
    if (!validating.has(node.nodeID) && !exclude.includes(node.nodeID)) return node;
  }
  return undefined;
}

export async function getPTxStatus(txID: string): Promise<string> {
  const result = await rpcCall<{ status: string }>(LOCAL_RPC_URL, "/ext/bc/P", "platform.getTxStatus", { txID });
  return result.status;
}

export async function waitForPTxCommitted(txID: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getPTxStatus(txID);
    if (status === "Committed") return;
    if (status === "Rejected" || status === "Dropped") throw new Error(`P-chain tx ${txID} ${status}`);
    await sleep(1_000);
  }
  throw new Error(`P-chain tx ${txID} not committed within ${timeoutMs}ms`);
}

/** The P-chain balance of `address` in nFLR. */
export async function getPBalance(address: string): Promise<bigint> {
  const result = await rpcCall<{ balance: string }>(LOCAL_RPC_URL, "/ext/bc/P", "platform.getBalance", {
    addresses: [address],
  });
  return BigInt(result.balance);
}

/** A random P-chain address no run has used, so its balance is whatever the test sends it. */
export function freshPAddress(): string {
  return `P-${futils.formatBech32("localflare", randomBytes(20))}`;
}

/** The transaction id in the CLI's "Transaction with hash … sent to the network" line. */
export function sentTxId(stdout: string): string {
  const txId = /hash (\w+)/.exec(stdout)?.[1];
  if (txId === undefined) throw new Error(`no transaction hash in: ${stdout}`);
  return txId;
}

/** Unix seconds for "now + seconds", for end times that must lie in the future. */
export function fromNow(seconds: number): string {
  return String(Math.floor(Date.now() / 1000) + seconds);
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
