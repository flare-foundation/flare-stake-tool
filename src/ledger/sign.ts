import fs from 'fs'
import AvalancheApp from '@avalabs/hw-app-avalanche'
import { sha256 } from 'ethereumjs-util'
import { recoverTransactionPublicKey, recoverTransactionSigner, prefix0x, standardizePublicKey, parseDerivationPath } from './utils'
import { logInfo } from '../output'
import { SignedTxJson, UnsignedTxJson, UnsignedWithdrawalTxJson } from '../interfaces'
import { getTransportPath } from './key'
import { forDefiDirectory, forDefiSignedTxnDirectory, forDefiUnsignedTxnDirectory } from '../constants/forDefi'
import { SignatureRequest } from '@flarenetwork/flarejs/dist/common'

/**
 * Used to generate signature using ledger
 * @param tx - unsigned transaction json file
 * @param derivationPath - path to the coount
 * @param blind - default true
 * @returns - returns the signature from ledger
 */
export async function ledgerSign(tx: UnsignedTxJson, derivationPath: string, blind: boolean = true): Promise<{
  signature: string, address: string, publicKey: string
}> {
  const message = blind ? tx.signatureRequests[0].message : tx.unsignedTransactionBuffer
  const messageBuffer = Buffer.from(message, 'hex')
  const transport = await getTransportPath()
  const avalanche = new AvalancheApp(transport)
  const { accountPath, signPath } = parseDerivationPath(derivationPath)
  let pubk: Buffer
  let addr: string
  let signature: string
  if (blind) {
    const resp = await avalanche.signHash(accountPath, [signPath], messageBuffer)
    if (resp.errorMessage != 'No errors') {
      throw new Error(`Can not sign message on ledger: ${resp.errorMessage}, code ${resp.returnCode}`)
    }
    const sign = resp.signatures?.get(signPath)?.toString('hex')
    if (!sign) {
      throw new Error("No signature returned")
    }
    signature = sign
    pubk = recoverTransactionPublicKey(messageBuffer, prefix0x(signature))
    addr = recoverTransactionSigner(messageBuffer, prefix0x(signature))
  } else {
    const resp = await avalanche.sign(accountPath, [signPath], messageBuffer)
    if (resp.errorMessage != 'No errors') {
      throw new Error(`Can not sign message on ledger: ${resp.errorMessage}, code ${resp.returnCode}`)
    }
    const sign = resp.signatures?.get(signPath)?.toString('hex')
    if (!sign) {
      throw new Error("No signature returned")
    }
    signature = sign
    pubk = recoverTransactionPublicKey(sha256(messageBuffer), prefix0x(signature))
    addr = recoverTransactionSigner(sha256(messageBuffer), prefix0x(signature))
  }
  return {
    signature: signature,
    address: addr,
    publicKey: standardizePublicKey(pubk.toString('hex'))
  }
}

/**
 *
 * @param id - file id
 * @param derivationPath - path to the accounts in ledger
 * @param blind - default true
 *
 */
export async function signId(id: string, derivationPath: string, blind: boolean = true) {
  return sign(`${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedTx.json`, derivationPath, blind)
}

/**
 *
 * @param file - file name
 * @param derivationPath - path to the accounts in ledger
 * @param blind - default true
 * @param _ledgerSign - for testcase implementation, need to pass ledgerSign
 */
export async function sign(file: string, derivationPath: string, blind: boolean = true, _ledgerSign = ledgerSign) {
  logInfo(`Please sign the transaction on your ledger device...`)
  const json = fs.readFileSync(file, 'utf8')
  const unsignedTx = JSON.parse(json) as UnsignedWithdrawalTxJson
  let tx: SignedTxJson = JSON.parse(json)
  const signatureRequest: SignatureRequest = {
    message: unsignedTx.message,
    signer: "",
  };
  tx.signatureRequests = [signatureRequest]
  if (tx && tx.signatureRequests && tx.signatureRequests.length > 0) {
    const { signature } = await _ledgerSign(tx, derivationPath, blind)
    tx.signature = signature
    let outFile = file.replace('unsignedTx.json', 'signedTx.json')
    outFile = outFile.replace(`${forDefiUnsignedTxnDirectory}`, `${forDefiSignedTxnDirectory}`)
    if (outFile === file) {
      outFile = file + '.signed'
    }
    fs.mkdirSync(`${forDefiDirectory}/${forDefiSignedTxnDirectory}`, { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify(tx, null, 2))
  } else {
    throw Error("Invalid transaction file")
  }
}