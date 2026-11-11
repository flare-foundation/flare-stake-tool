/**
 * Transactions as the commands see them: pre-flight checks that need chain
 * state, then the pipeline. The checks run on every signing path.
 */
import type { Account } from "../chain/keys";
import { currentValidators, stakesOf, type CurrentValidator } from "../chain/validators";
import { formatFlr } from "../chain/units";
import { buildTransaction } from "../core/builders";
import { ESTIMATED_FEE_BASE_FEE_MULTIPLIER } from "../core/builders/pchain";
import { atomicTxFee } from "../core/fee";
import { executeTransaction } from "../core/pipeline";
import type { ConfirmOptions } from "../core/submit";
import { IMMEDIATE_SIGNER_POLICY, type Env, type Outcome, type Signer, type TxRequest } from "../core/types";
import { logIssued } from "../output";

/** A P-chain account may stake to at most this many distinct nodes in overlapping periods. */
export const MAX_NODES_PER_ACCOUNT = 3;

export async function runTransaction(
  req: TxRequest,
  env: Env,
  signer: Signer,
  confirm: ConfirmOptions = { onIssued: logIssued }
): Promise<Outcome> {
  await env.clients.verifyNetwork();
  await preflight(req, env, await signer.account());
  return executeTransaction(req, env, signer, confirm);
}

/**
 * The fee (nFLR) an atomic transaction would pay if built now from the chain's
 * fee state, as an immediate signer builds it. Nothing is signed or sent.
 */
export async function estimateAtomicFee(req: TxRequest, env: Env, account: Account): Promise<bigint> {
  await env.clients.verifyNetwork();
  const bundle = await buildTransaction(req, env, account, IMMEDIATE_SIGNER_POLICY);
  if (bundle.kind !== "atomic") {
    throw new Error(`${req.type} is not an atomic transaction`);
  }
  return atomicTxFee(bundle.unsignedTx, await env.clients.context());
}

/**
 * A warning for a fee typed by the user that is below what the transaction
 * costs at the current base fee: `estimate` covers ESTIMATED_FEE_BASE_FEE_MULTIPLIER
 * times the base fee, so the cost at the base fee itself is estimate / multiplier.
 * The node rejects such a transaction unless the base fee drops before it lands.
 */
export function underpricedFeeWarning(fee: bigint, estimate: bigint, symbol: string): string | undefined {
  const atBaseFee = estimate / ESTIMATED_FEE_BASE_FEE_MULTIPLIER;
  if (fee >= atBaseFee) return undefined;
  return (
    `A fee of ${formatFlr(fee)} ${symbol} is below the ${formatFlr(atBaseFee)} ${symbol} this transaction costs ` +
    "at the current base fee; the node will reject it unless the base fee drops first"
  );
}

async function preflight(req: TxRequest, env: Env, account: Account): Promise<void> {
  switch (req.type) {
    case "stake": {
      const validators = await currentValidators(env);
      checkNodeLimit(validators, account, req.nodeId, req.endTime);
      return;
    }
    case "delegate": {
      const validators = await currentValidators(env);
      checkNodeLimit(validators, account, req.nodeId, req.endTime);
      const target = validators.find((v) => v.nodeID === req.nodeId);
      if (!target) {
        throw new Error("Unknown node id");
      }
      if (req.endTime > BigInt(target.endTime)) {
        throw new Error(
          `End time must be within the validator's current period, which ends at ${target.endTime} (${new Date(Number(target.endTime) * 1000).toISOString()})`
        );
      }
      return;
    }
    case "addAutoRenewedValidator": {
      await requireHelicon(env);
      const validators = await currentValidators(env);
      checkNodeLimit(validators, account, req.nodeId, undefined);
      return;
    }
    case "setAutoRenewedValidatorConfig":
      await requireHelicon(env);
      return;
    default:
      return;
  }
}

async function requireHelicon(env: Env): Promise<void> {
  if (!(await env.clients.isHeliconActive())) {
    throw new Error(`Auto-renewed validators (Helicon upgrade) are not active on ${env.network.name}`);
  }
}

/**
 * Refuses a stake or delegation to a fourth distinct node while stakes to three
 * other nodes overlap its period. The period starts now whatever start time the
 * transaction carries: since Durango the chain starts a stake when it accepts it.
 * The account's delegations are read from the validators' lists, so a node that
 * counts delegations without listing them is refused rather than trusted to
 * have none.
 */
export function checkNodeLimit(
  validators: CurrentValidator[],
  account: Account,
  nodeId: string,
  endTime: bigint | undefined,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000))
): void {
  const unlisted = validators.find((v) => BigInt(v.delegatorCount ?? "0") > BigInt(v.delegators?.length ?? 0));
  if (unlisted) {
    throw new Error(
      `The node lists ${unlisted.delegators?.length ?? 0} of the ${unlisted.delegatorCount} delegations to ` +
        `${unlisted.nodeID}, so the account's stakes cannot be checked against the limit of ` +
        `${MAX_NODES_PER_ACCOUNT} nodes; use a node that lists them (--rpc-url)`
    );
  }
  const overlapping = stakesOf(validators, account.pAddress).filter(
    (stake) => stake.endTime >= nowSeconds && (endTime === undefined || stake.startTime <= endTime)
  );
  const nodeIds = new Set(overlapping.map((stake) => stake.nodeId.toLowerCase()));
  if (nodeIds.size >= MAX_NODES_PER_ACCOUNT && !nodeIds.has(nodeId.toLowerCase())) {
    throw new Error(
      `In the selected time period the account already has active stakes to ${nodeIds.size} different nodes`
    );
  }
}
