import type { Account } from "../../chain/keys";
import type { BuildPolicy, Env, TxRequest, UnsignedTxBundle } from "../types";
import {
  buildClaim,
  buildCustomCChainTx,
  buildSetAllowedClaimRecipients,
  buildSetClaimExecutors,
  buildWithdrawal,
} from "./evm";
import {
  buildAddAutoRenewedValidator,
  buildDelegate,
  buildExportCP,
  buildExportPC,
  buildImportCP,
  buildImportPC,
  buildSetAutoRenewedValidatorConfig,
  buildStake,
  buildTransfer,
} from "./pchain";

/** Dispatches a request to its builder. */
export function buildTransaction(
  req: TxRequest,
  env: Env,
  account: Account,
  policy: BuildPolicy
): Promise<UnsignedTxBundle> {
  switch (req.type) {
    case "exportCP":
      return buildExportCP(req, env, account, policy);
    case "importCP":
      return buildImportCP(req, env, account, policy);
    case "exportPC":
      return buildExportPC(req, env, account, policy);
    case "importPC":
      return buildImportPC(req, env, account, policy);
    case "stake":
      return buildStake(req, env, account, policy);
    case "delegate":
      return buildDelegate(req, env, account, policy);
    case "transfer":
      return buildTransfer(req, env, account, policy);
    case "addAutoRenewedValidator":
      return buildAddAutoRenewedValidator(req, env, account, policy);
    case "setAutoRenewedValidatorConfig":
      return buildSetAutoRenewedValidatorConfig(req, env, account, policy);
    case "claim":
      return buildClaim(req, env, account);
    case "withdrawal":
      return buildWithdrawal(req, env, account);
    case "setClaimExecutors":
      return buildSetClaimExecutors(req, env, account);
    case "setAllowedClaimRecipients":
      return buildSetAllowedClaimRecipients(req, env, account);
    case "customCChainTx":
      return buildCustomCChainTx(req, env, account);
  }
}
