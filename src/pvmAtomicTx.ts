import { EcdsaSignature } from '@flarenetwork/flarejs/dist/common'
import { BN, Buffer } from '@flarenetwork/flarejs/dist'
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm'
import { UnixNow } from '@flarenetwork/flarejs/dist//utils'
import { SignedTxJson, UnsignedTxJson, Context } from './interfaces'
import { deserializeUnsignedTx, expandSignature, serializeUnsignedTx } from './utils'


type ImportCPParams = [
  UTXOSet, string[], string, string[], string[], string[], Buffer | undefined, BN, BN, number
]
type ExportPCParams = [
  UTXOSet, BN, string, string[], string[], string[], Buffer | undefined, BN, BN, number
]

/**
 * Import funds exported from C-chain to P-chain to P-chain
 * @param ctx - context with constants initialized from user keys
 */
export async function importTxCP(ctx: Context, threshold?: number): Promise<{ txid: string }> {
  const params = await getImportCPParams(ctx, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildImportTx(...params)
  const tx: Tx = unsignedTx.sign(ctx.pKeychain)
  const txid: string = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}

/**
 * Export funds from P-chain to C-chain.
 * @param ctx - context with constants initialized from user keys
 * @param amount - amount to export (if left undefined, it exports all funds on P-chain)
 */
export async function exportTxPC(ctx: Context, amount?: BN, threshold?: number): Promise<{ txid: string }> {
  const params = await getExportPCParams(ctx, amount, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildExportTx(...params)
  const tx: Tx = unsignedTx.sign(ctx.pKeychain)
  const txid: string = await ctx.pchain.issueTx(tx)
  return { txid: txid }
}

/**
 * Get unsigned transaction for import from C-chain to P-chain.
 * @param ctx - context with constants initialized from user keys
 */
export async function getUnsignedImportTxCP(ctx: Context, threshold?: number): Promise<UnsignedTxJson> {
  const params = await getImportCPParams(ctx, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildImportTx(...params)
  return {
    transactionType: 'importCP',
    serialization: serializeUnsignedTx(unsignedTx),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
  }
}

/**
 * Get unsigned transaction for export from C-chain to P-chain.
 * @param ctx - context with constants initialized from user keys
 * @param amount - amount to export (if left undefined, it exports all funds on P-chain)
 */
export async function getUnsignedExportTxPC(ctx: Context, amount?: BN, threshold?: number): Promise<UnsignedTxJson> {
  const params = await getExportPCParams(ctx, amount, threshold)
  const unsignedTx: UnsignedTx = await ctx.pchain.buildExportTx(...params)
  return {
    transactionType: 'exportPC',
    serialization: serializeUnsignedTx(unsignedTx),
    signatureRequests: unsignedTx.prepareUnsignedHashes(ctx.cKeychain),
    unsignedTransactionBuffer: unsignedTx.toBuffer().toString('hex')
  }
}

/**
 * Issues a signed P-chain transation
 * @param ctx - context with constants initialized from user keys
 * @param id - id associated with the transaction
 */
export async function issueSignedPvmTx(ctx: Context, signedTxJson: SignedTxJson): Promise<{ chainTxId: string }> {
  const signatures = Array(signedTxJson.signatureRequests.length).fill(signedTxJson.signature)
  const ecdsaSignatures: EcdsaSignature[] = signatures.map((signature: string) => expandSignature(signature))
  const unsignedTx = deserializeUnsignedTx(UnsignedTx, signedTxJson.serialization)
  const tx: Tx = unsignedTx.signWithRawSignatures(ecdsaSignatures, ctx.cKeychain)
  const chainTxId = await ctx.pchain.issueTx(tx)
  return { chainTxId: chainTxId }
}

async function getImportCPParams(ctx: Context, threshold: number = 1): Promise<ImportCPParams> {
  const locktime: BN = new BN(0)
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs(
    [ctx.pAddressBech32!],
    ctx.cChainBlockchainID
  )
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos
  return [
    utxoSet,
    [ctx.pAddressBech32!],
    ctx.cChainBlockchainID,
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    undefined,
    asOf,
    locktime,
    threshold
  ]
}

async function getExportPCParams(ctx: Context, amount?: BN, threshold: number = 1): Promise<ExportPCParams> {
  const locktime: BN = new BN(0)
  const asOf: BN = UnixNow()
  const platformVMUTXOResponse: any = await ctx.pchain.getUTXOs([ctx.pAddressBech32!])
  const utxoSet: UTXOSet = platformVMUTXOResponse.utxos
  const fee = ctx.pchain.getDefaultTxFee()
  // if amount is not passed, export all funds minus the fee
  if (amount === undefined) {
    const getBalanceResponse: any = await ctx.pchain.getBalance(ctx.pAddressBech32!)
    const unlocked = new BN(getBalanceResponse.unlocked)
    amount = unlocked.sub(fee)
  }
  return [
    utxoSet,
    amount,
    ctx.cChainBlockchainID,
    [ctx.cAddressBech32!],
    [ctx.pAddressBech32!],
    [ctx.pAddressBech32!],
    undefined,
    asOf,
    locktime,
    threshold
  ]
}