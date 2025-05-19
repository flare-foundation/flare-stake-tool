import fs from 'fs'
import { UnsignedEvmTxJson, SignedEvmTxJson } from '../interfaces'
import { forDefiDirectory, forDefiSignedTxnDirectory, forDefiUnsignedTxnDirectory } from '../constants/forDefi'
import Web3 from 'web3'

export function saveUnsignedEvmTx(unsignedTx: UnsignedEvmTxJson, id: string): void {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedTx.json`
  if (fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} already exists`)
  }
  const serialization = JSON.stringify(unsignedTx, null, 2)
  fs.mkdirSync(`${forDefiDirectory}/${forDefiUnsignedTxnDirectory}`, { recursive: true })
  fs.writeFileSync(fname, serialization)
}

export function readUnsignedEvmTx(id: string): UnsignedEvmTxJson {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  return JSON.parse(serialization) as UnsignedEvmTxJson
}

export function readSignedEvmTx(id: string): SignedEvmTxJson {
  const fname = `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`signedTx file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  const resp = JSON.parse(serialization) as SignedEvmTxJson
  if (!resp.signature) {
    throw new Error(`unsignedTx file ${fname} does not contain signature`)
  }
  return resp
}

export function waitFinalize3Factory(web3: Web3) {
  return async function <T> (
    address: string,
    func: () => T,
    delay: number = 1000,
    test: boolean = false
  ): Promise<T> {
    let totalDelay = 0;
    const nonce = await web3.eth.getTransactionCount(address)
    const result = await func();
    let backoff = 1.5;
    let cnt = 0;
    while ((await web3.eth.getTransactionCount(address)) == nonce) {
      // if test is enabled, it will skip the timeout as it was getting stuck here
      if (!test)
        await new Promise<void>((resolve) => { setTimeout(resolve, delay) })
      if (cnt < 8) {
        totalDelay += delay;
        delay = Math.floor(delay * backoff);
        cnt++;
      } else {
        throw new Error(`Response timeout after ${totalDelay}ms`);
      }
      console.log(`Delay backoff ${delay} (${cnt})`);
    }
    return result;
  }
}

export function getWeb3Contract(web3: Web3, address: string, abi: any) {
  return new web3.eth.Contract(abi, address);
};

export function getAbi(abiPath: string) {
  if (!fs.existsSync(abiPath)) {
    throw new Error(`ABI file not found: ${abiPath}`);
  }
  let abi: unknown = JSON.parse(fs.readFileSync(abiPath).toString());
  if (abi && typeof abi === "object" && "abi" in abi) {
      abi = abi.abi;
  }
  return abi;
}