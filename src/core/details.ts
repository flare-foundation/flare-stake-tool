/**
 * What a built transaction pays, moves and took from the chain, read from the transaction itself just before it is
 * signed: interactive mode shows it for confirmation, and the outcome carries it, so that what the user approves is
 * what gets signed.
 */
import { utils as futils, type Context, type evmSerial } from "@flarenetwork/flarejs";
import { contractInterface } from "../chain/contracts";
import { asNFlr, asWei, type NFlr, type Wei } from "../chain/units";
import { atomicTxFee } from "./fee";
import type { UnsignedTxBundle } from "./types";

export interface BuiltDetails {
  /** P-chain and atomic transactions: the fee they burn. */
  fee?: NFlr | undefined;
  /** importCP and importPC: what arrives on the destination chain, the UTXOs taken minus the fee. */
  imported?: NFlr | undefined;
  /**
   * C-chain transactions: the nonce (also exportCP's, of its C-chain input), the value sent, and the most the gas can
   * cost (gas limit × max fee per gas).
   */
  nonce?: number | undefined;
  value?: Wei | undefined;
  maxGasCost?: Wei | undefined;
  /** claim: the amount claimed, all unclaimed rewards when no amount was given. */
  claimed?: Wei | undefined;
}

type OutputsTx = Parameters<typeof futils.getOutputAmounts>[0];

/** The details of `bundle`; an atomic one needs the Context its fee and amounts are read with. */
export function builtDetails(bundle: UnsignedTxBundle, context: Context.Context | undefined): BuiltDetails {
  if (bundle.kind === "atomic") {
    if (context === undefined) return {};
    const imports = bundle.txType === "importCP" || bundle.txType === "importPC";
    const received = futils.getOutputAmounts(bundle.unsignedTx.getTx() as OutputsTx).get(context.avaxAssetID);
    // exportCP spends from the C-chain account with its nonce, read from the chain like an EVM transaction's
    const exported = bundle.txType === "exportCP" ? (bundle.unsignedTx.getTx() as evmSerial.ExportTx) : undefined;
    return {
      fee: atomicTxFee(bundle.unsignedTx, context),
      ...(imports ? { imported: asNFlr(received ?? 0n) } : {}),
      ...(exported?.ins[0] ? { nonce: Number(exported.ins[0].nonce.value()) } : {}),
    };
  }
  const { tx } = bundle;
  const claimed =
    bundle.txType === "claim"
      ? asWei((contractInterface.decodeFunctionData("claim", tx.data) as unknown as [string, string, bigint])[2])
      : undefined;
  return {
    nonce: tx.nonce,
    value: asWei(tx.value),
    maxGasCost: asWei(tx.gasLimit * (tx.maxFeePerGas ?? tx.gasPrice ?? 0n)),
    ...(claimed !== undefined ? { claimed } : {}),
  };
}
