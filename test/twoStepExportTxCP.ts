import { Context } from '../src/constants'
import { integerToDecimal } from '../src/utils'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UnsignedTx, Tx, UTXOSet, ExportTx } from '@flarenetwork/flarejs/dist/apis/evm'
import { EcdsaSignature, SignatureRequest } from '@flarenetwork/flarejs/dist/common'
import { costImportTx, costExportTx, Serialization } from "@flarenetwork/flarejs/dist/utils"

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

// serialization of atomic c-chain addresses does not work correctly, so we have to improvise
function serializeArgs(args: [BN, string, string, string, string, string[], number, BN, number, BN?]): string {
  [0,7,9].map(i => args[i] = args[i]!.toString(16))
  return JSON.stringify(args)
}

function deserializeArgs(serargs: string): [BN, string, string, string, string, string[], number, BN, number, BN?] {
  const args = JSON.parse(serargs);
  [0,7,9].map(i => args[i] = new BN(args[i], 16))
  return args
}

export async function exportTxCPUnsignedHashes(
  ctx: Context, amount: BN, fee?: BN
): Promise<SignData> {
  const threshold = 1
  const txcount = await ctx.web3.eth.getTransactionCount(ctx.cAddressHex)
  const nonce: number = txcount
  const locktime: BN = new BN(0)
  const importFee: BN = ctx.pchain.getDefaultTxFee()

  const args: [BN, string, string, string, string, string[], number, BN, number, BN?] = [
    amount.add(importFee),
    ctx.avaxAssetID,
    ctx.pChainBlockchainID,
    ctx.cAddressHex,
    ctx.cAddressBech32!,
    [ctx.pAddressBech32!],
    nonce,
    locktime,
    threshold,
    fee
  ]

  let unsignedTx = await ctx.cchain.buildExportTx(...args)
  if (fee === undefined) {
    const baseFeeResponse: string = await ctx.cchain.getBaseFee()
    const baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9)
    const exportCost: number = costExportTx(unsignedTx)
    args[9] = baseFee.mul(new BN(exportCost))
    unsignedTx = await ctx.cchain.buildExportTx(...args)
  }

  console.log('used fee', integerToDecimal(args[9]!.toString(), 9))
  return <SignData>{
    requests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    transaction: serializeArgs(args)
  }
}

export async function exportTxCPSignWithRawSignatures(
  ctx: Context, signatures: string[], transaction: any
): Promise<any> {
  const ecdsaSignatures: EcdsaSignature[] = signatures.map(
    (signature: string) => fireblocksSignatureToEcdsaSignature(signature))
  const unsignedTx = await ctx.cchain.buildExportTx(...deserializeArgs(transaction))
  const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
  const txid = await ctx.cchain.issueTx(tx)
  return { txid: txid }
}