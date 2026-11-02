import { utils as futils, type Context, type UnsignedTx } from "@flarenetwork/flarejs";

type BurnableTx = Parameters<typeof futils.getBurnedAmountByTx>[0];

/**
 * The fee an atomic transaction pays, in nFLR: what its inputs hold beyond its
 * outputs and stake (flarejs `getBurnedAmountByTx`). Read from the built
 * transaction itself, so it is exactly what the chain burns, whether the fee
 * was given (`-f`) or estimated from the base fee or the P-chain fee state.
 */
export function atomicTxFee(unsignedTx: UnsignedTx, context: Context.Context): bigint {
  return futils.getBurnedAmountByTx(unsignedTx.getTx() as BurnableTx, context).get(context.avaxAssetID) ?? 0n;
}
