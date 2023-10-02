import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { UnsignedTxJson, Context } from '../interfaces'
import { serializeUnsignedTx, delegationAddressCount } from '../utils'
import { maxAllowedDelegation } from '../constants/contracts'


type AddDelegatorParams = [
  UTXOSet, string[], string[], string[], string, BN, BN, BN,
  string[], BN, number, Buffer | undefined, BN
]

async function checkMaximumAllowedDelegation(ctx: Context){
  const numberOfDelegation = await delegationAddressCount(ctx);
  if(numberOfDelegation >= maxAllowedDelegation){
    throw new Error(`Exceeded maximum allowed delegation of ${maxAllowedDelegation}`)
  }
}
/**
 * @description - Delegate funds to a given validator
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 */
export async function addDelegator(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  threshold?: number
) {
  await checkMaximumAllowedDelegation(ctx)
  const params = await getAddDelegatorParams(ctx, nodeID, stakeAmount, startTime, endTime, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddDelegatorTx(...params)
  const tx: Tx = unsignedTx.sign(ctx.pKeychain)
  const txid: string = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}

/**
 * @description - Generate an unisgned transaction for the add-delegator transaction
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 */
export async function getUnsignedAddDelegator(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  threshold?: number
): Promise<UnsignedTxJson> {
  await checkMaximumAllowedDelegation(ctx)
  const params = await getAddDelegatorParams(ctx, nodeID, stakeAmount, startTime, endTime, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddDelegatorTx(...params)
  return {
    transactionType: 'delegate',
    serialization: serializeUnsignedTx(unsignedTx),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
  }
}


/**
 * @description - Generate the parameters for getUnsignedAddDelegator and addDelegator
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 */
export async function getAddDelegatorParams(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN,
  threshold: number = 1
): Promise<AddDelegatorParams> {
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
    locktime,
    threshold,
    undefined,
    asOf
  ]
}
