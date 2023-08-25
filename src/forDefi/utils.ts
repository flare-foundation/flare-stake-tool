import fs from 'fs'
import { UnsignedWithdrawalTxJson, SignedWithdrawalTxJson } from '../interfaces'

// withdrawal
export function saveUnsignedWithdrawalTx(unsignedTx: UnsignedWithdrawalTxJson, id: string): void {
  const fname = `${id}.unsignedTx.json`
  if (fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} already exists`)
}
  const serialization = JSON.stringify(unsignedTx, null, 2)
  fs.writeFileSync(fname, serialization)
}

export function readUnsignedWithdrawalTx(id: string): UnsignedWithdrawalTxJson {
  const fname = `${id}.unsignedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  return JSON.parse(serialization) as UnsignedWithdrawalTxJson
}

export function readSignedWithdrawalTx(id: string): SignedWithdrawalTxJson {
  const fname = `${id}.signedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`signedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  const resp = JSON.parse(serialization) as SignedWithdrawalTxJson
  if (!resp.signature) {
    throw new Error(`unsignedTx file ${fname} does not contain signature`)
  }
  return resp
}

export function waitFinalize3Factory(web3: any) {
  return async function (address: string, func: () => any, delay: number = 1000) {
    let totalDelay = 0;
    let nonce = await web3.eth.getTransactionCount(address)
    let res = await func();
    let backoff = 1.5;
    let cnt = 0;
    while ((await web3.eth.getTransactionCount(address)) == nonce) {
      await new Promise((resolve: any) => { setTimeout(() => { resolve() }, delay) })
      if (cnt < 8) {
          totalDelay += delay;
          delay = Math.floor(delay * backoff);
          cnt++;
      } else {
          throw new Error(`Response timeout after ${totalDelay}ms`);
      }
      console.log(`Delay backoff ${delay} (${cnt})`);
    }
    return res;
  }
}