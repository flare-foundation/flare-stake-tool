import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { UnsignedTxJson, Context } from '../interfaces'
import { serializeUnsignedTx } from '../utils'


type AddValidatorParams = [
  UTXOSet, string[], string[], string[], string, BN, BN, BN,
  string[], number, BN, number, Buffer | undefined, BN
]

/**
 * @description - Stake by registring your node for validation
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 * @param delegationFee - the fee you charge for delegating to your node
 */
export async function addValidator(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  delegationFee: number,
  threshold?: number
): Promise<{ txid: string }> {
  const params = await getAddValidatorParams(ctx, nodeID, stakeAmount, startTime, endTime, delegationFee, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddValidatorTx(...params)
  const tx: Tx = unsignedTx.sign(ctx.pKeychain)
  const txid: string = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}

/**
 * @description - Get hashes that need to get signed for the addValidator transaction
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 * @param delegationFee - the fee you charge for delegating to your node
 */
export async function getUnsignedAddValidator(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  delegationFee: number,
  threshold?: number
): Promise<UnsignedTxJson> {
  const params = await getAddValidatorParams(ctx, nodeID, stakeAmount, startTime, endTime, delegationFee, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddValidatorTx(...params)
  return {
    transactionType: 'stake',
    serialization: serializeUnsignedTx(unsignedTx),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
  }
}


/**
 * @description - Get the parameters for getUnsignedAddValidator and addValidator
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 * @param delegationFee - the fee you charge for delegating to your node
 */
export async function getAddValidatorParams(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  delegationFee: number,
  threshold: number = 1
): Promise<AddValidatorParams> {
  const locktime: BN = new BN(0)
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos
  return [
    utxoSet,
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    nodeID,
    startTime,
    endTime,
    stakeAmount,
    [ctx.pAddressBech32!],
    delegationFee,
    locktime,
    threshold,
    undefined,
    asOf
  ]
}