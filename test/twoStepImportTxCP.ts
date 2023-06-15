import { Context } from '../src/constants'
import { integerToDecimal } from '../src/utils'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UnsignedTx, Tx, UTXOSet, ExportTx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { EcdsaSignature, SignatureRequest } from '@flarenetwork/flarejs/dist/common'
import { costImportTx, costExportTx, Serialization, UnixNow } from "@flarenetwork/flarejs/dist/utils"

interface SignData {
  requests: CompressedSignatureRequest[],
  transaction: string
}

interface CompressedSignatureRequest extends SignatureRequest {
  indices: number[]
}

/* function compressSign(signData: SignatureRequest[]): CompressedSignatureRequest[] {
  const repetitions: number[] = []
  const uniqueRequests: SignatureRequest[] = []
  for (let i = 0; i < signData.length; i++) {
    const d = signData[i]
    if (index === -1) {
      uniqueRequests.push(d)
      repetitions.push(1)
    } else {
      repetitions[index]++
    }
  }
} */

function fireblocksSignatureToEcdsaSignature(signature: string): EcdsaSignature {
  return {
    r: new BN(signature.slice(0, 64), 'hex'),
    s: new BN(signature.slice(64, 128), 'hex'),
    recoveryParam: (new BN(signature.slice(128, 130), 'hex')).toNumber() - 27
  }
}

export async function importTxCP_unsignedHashes(ctx: Context): Promise<SignData> {
  const threshold = 1
  const locktime: BN = new BN(0)
  const memo: Buffer = Buffer.from(
    'PlatformVM utility method buildImportTx to import AVAX to the P-Chain from the C-Chain'
    )
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(
    [ctx.pAddressBech32!],
    ctx.cChainBlockchainID
  )
  const unsignedTx: UnsignedTx = await ctx.pchain.buildImportTx(
    platformVMUTXOResponse.utxos,
    [ctx.pAddressBech32!],
    ctx.cChainBlockchainID,
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    memo,
    asOf,
    locktime,
    threshold
  )
  return <SignData>{
    requests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    transaction: JSON.stringify(unsignedTx.serialize("hex"))
  }
}

export async function importTxCPSign_rawSignatures(
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