import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist/utils'
import { EcdsaSignature } from '@flarenetwork/flarejs/dist/common'
import { Context } from './constants'
import { SignData } from './interfaces'
import { deserializeUnsignedTx, expandSignature, serializeUnsignedTx } from './utils'


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
    nodeID: string,
    stakeAmount: BN,
    startTime: BN,
    endTime: BN
  ): Promise<SignData> {
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
    return <SignData>{
      requests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
      transaction: serializeUnsignedTx(unsignedTx),
      unsignedTransaction: unsignedTx.toBuffer().toString('hex')
    }
  }

  export async function addDelegator_rawSignatures(
    ctx: Context, signatures: string[], transaction: string
  ): Promise<any> {
    const ecdsaSignatures: EcdsaSignature[] = signatures.map((signature: string) => expandSignature(signature))
    const unsignedTx = deserializeUnsignedTx(UnsignedTx, transaction)
    const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
    const txid = await ctx.pchain.issueTx(tx)
    return { txid: txid }
  }