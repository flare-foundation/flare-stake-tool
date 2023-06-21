import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { EcdsaSignature, SignatureRequest } from '@flarenetwork/flarejs/dist/common'
import { Context } from './constants'
import { UnsignedTxJson } from './interfaces'
import { deserializeUnsignedTx, expandSignature, serializeUnsignedTx, saveUnsignedTx, readUnsignedTx } from './utils'


export async function addDelegator(
    ctx: Context,
    nodeID: string,
    stakeAmount: BN,
    startTime: BN,
    endTime: BN
) {
    const threshold: number = 1
    const locktime: BN = new BN(0)
    const memo: Buffer = Buffer.from(
    "PlatformVM utility method buildAddDelegatorTx to add a delegator to the primary subnet"
    )
    const asOf: BN = UnixNow()
    const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)
    const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

    const unsignedTx: UnsignedTx = await ctx.pchain.buildAddDelegatorTx(
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
        memo,
        asOf
    )

    const tx: Tx = unsignedTx.sign(ctx.pKeychain)
    const txid: string = await ctx.pchain.issueTx(tx)
    return { txid: txid }
}

export async function addDelegator_unsignedHashes(
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
      "PlatformVM utility method buildAddDelegatorTx to add a delegator to the primary subnet"
    )
    const asOf: BN = UnixNow()
    const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)
    const utxoSet: UTXOSet = platformVMUTXOResponse.utxos

    const unsignedTx: UnsignedTx = await ctx.pchain.buildAddDelegatorTx(
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
      memo,
      asOf
    )
    const unsignedTxJson = <UnsignedTxJson>{
      serialization: serializeUnsignedTx(unsignedTx),
      signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
      unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
    }
    saveUnsignedTx(unsignedTxJson, id)
    return unsignedTx.prepareUnsignedHashes(ctx.cKeychain)
  }

  export async function addDelegator_rawSignatures(
    ctx: Context, signatures: string[], id: string
  ): Promise<any> {
    const unsignedTxJson = readUnsignedTx(id)
    if (signatures.length !== unsignedTxJson.signatureRequests.length) {
      signatures = Array(unsignedTxJson.signatureRequests.length).fill(signatures[0])
    }
    const ecdsaSignatures: EcdsaSignature[] = signatures.map((signature: string) => expandSignature(signature))
    const unsignedTx = deserializeUnsignedTx(UnsignedTx, unsignedTxJson.serialization)
    const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
    const txid = await ctx.pchain.issueTx(tx)
    return { txid: txid }
  }