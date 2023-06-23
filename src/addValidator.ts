import { EcdsaSignature, SignatureRequest } from '@flarenetwork/flarejs/dist/common'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { Context } from './constants'
import { UnsignedTxJson } from './interfaces'
import { deserializeUnsignedTx, expandSignature, serializeUnsignedTx, saveUnsignedTx, readUnsignedTx, readSignedTx } from './utils'

/**
 * Stake by registring your node for validation
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 */
export async function addValidator(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN
): Promise<{ txid: string }> {
  const threshold = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    'PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet'
  )
  const asOf: BN = UnixNow()
  const delegationFee = 10
  // const stakeAmount: any = (await pchain.getMinStake()).minValidatorStake
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddValidatorTx(
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
    memo,
    asOf
  )
  const tx: Tx = unsignedTx.sign(ctx.pKeychain)
  const txid: string = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}

/**
 * Get hashes that need to get signed for the addValidator transaction
 * @param ctx - context with constants initialized from user keys
 * @param nodeID - id of the node you are running (can get it via rpc call)
 * @param stakeAmount - the amount of funds to stake during the node's validation
 * @param startTime - start time of the node's validation
 * @param endTime - end time of the node's validation
 */
export async function getUnsignedAddValidator(
  ctx: Context,
  id: string,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN
): Promise<SignatureRequest[]> {
  const threshold = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    'PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet'
  )
  const asOf: BN = UnixNow()
  const delegationFee = 10
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)

  const unsignedTx: UnsignedTx = await ctx.pchain.buildAddValidatorTx(
    platformVMUTXOResponse.utxos,
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
    memo,
    asOf
  )
  const unsignedTxJson = <UnsignedTxJson>{
    serialization: serializeUnsignedTx(unsignedTx),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
  }
  saveUnsignedTx(unsignedTxJson, id)
  return unsignedTxJson.signatureRequests
}