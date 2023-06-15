import { Context } from '../src/constants'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UnsignedTx, Tx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { EcdsaSignature, SignatureRequest } from '@flarenetwork/flarejs/dist/common'
import { UnixNow } from "@flarenetwork/flarejs/dist/utils"

interface SignData {
  requests: CompressedSignatureRequest[],
  transaction: string
}

interface CompressedSignatureRequest extends SignatureRequest {
  indices: number[]
}

function fireblocksSignatureToEcdsaSignature(signature: string): EcdsaSignature {
  return {
    r: new BN(signature.slice(0, 64), 'hex'),
    s: new BN(signature.slice(64, 128), 'hex'),
    recoveryParam: (new BN(signature.slice(128, 130), 'hex')).toNumber() - 27
  }
}

export async function addValidator_unsignedHashes(
  ctx: Context,
  nodeID: string,
  stakeAmount: BN,
  startTime: BN,
  endTime: BN
): Promise<SignData> {
  const threshold = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    'PlatformVM utility method buildAddValidatorTx to add a validator to the primary subnet'
  )
  const asOf: BN = UnixNow()
  const delegationFee = 10
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(ctx.pAddressBech32!)

  console.log(platformVMUTXOResponse.utxos.getUTXOs)

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
  return <SignData>{
    requests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    transaction: JSON.stringify(unsignedTx.serialize("hex"))
  }
}

export async function addValidator_rawSignatures(
  ctx: Context, signatures: string[], transaction: any
): Promise<any> {
  const ecdsaSignatures: EcdsaSignature[] = signatures.map(
    (signature: string) => fireblocksSignatureToEcdsaSignature(signature))
  const unsignedTx = new UnsignedTx()
  unsignedTx.deserialize(JSON.parse(transaction), 'hex')
  const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
  const txid = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}