/**
 * Transactions as the commands see them: pre-flight checks that need chain
 * state, then the pipeline. The checks run on every signing path.
 */
import type { Account } from "../chain/keys";
import { currentValidators, stakesOf, type CurrentValidator } from "../chain/validators";
import { buildTransaction } from "../core/builders";
import { atomicTxFee } from "../core/fee";
import { executeTransaction } from "../core/pipeline";
import { IMMEDIATE_SIGNER_POLICY, type Env, type Outcome, type Signer, type TxRequest } from "../core/types";

/** A P-chain account may stake to at most this many distinct nodes in overlapping periods. */
export const MAX_NODES_PER_ACCOUNT = 3;

export async function runTransaction(req: TxRequest, env: Env, signer: Signer): Promise<Outcome> {
  await env.clients.verifyNetwork();
  await preflight(req, env, await signer.account());
  return executeTransaction(req, env, signer);
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

async function preflight(req: TxRequest, env: Env, account: Account): Promise<void> {
  switch (req.type) {
    case "stake": {
      const validators = await currentValidators(env);
      checkNodeLimit(validators, account, req.nodeId, req.startTime, req.endTime);
      return;
    }
    case "delegate": {
      const validators = await currentValidators(env);
      checkNodeLimit(validators, account, req.nodeId, req.startTime, req.endTime);
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
      checkNodeLimit(validators, account, req.nodeId, undefined, undefined);
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
 * other nodes overlap the requested period.
 */
export function checkNodeLimit(
  validators: CurrentValidator[],
  account: Account,
  nodeId: string,
  startTime: bigint | undefined,
  endTime: bigint | undefined
): void {
  const start = startTime ?? BigInt(Math.floor(Date.now() / 1000));
  const overlapping = stakesOf(validators, account.pAddress).filter(
    (stake) => stake.endTime >= start && (endTime === undefined || stake.startTime <= endTime)
  );
  const nodeIds = new Set(overlapping.map((stake) => stake.nodeId.toLowerCase()));
  if (nodeIds.size >= MAX_NODES_PER_ACCOUNT && !nodeIds.has(nodeId.toLowerCase())) {
    throw new Error(
      `In the selected time period the account already has active stakes to ${nodeIds.size} different nodes`
    );
  }
}
