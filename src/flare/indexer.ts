import * as settings from "../settings"
import * as pubk from "./pubk"
import { PStake } from "./interfaces"
import BN from "bn.js"

interface PaginatedRequest {
  limit: number,
  offset: number
}

interface Response {
  data: any,
  errorMessage: string
}

export async function getPStakes(
  network: string,
  pAddress?: string,
  date?: Date
): Promise<Array<PStake>> {
  let result = new Array<PStake>()
  let apis = ["validators/list", "delegators/list"]
  let types = ["validator", "delegator"]

  let time = (date ? date : new Date()).toISOString()
  for (let i = 0; i < apis.length; i++) {
    let limit = 100
    let offset = 0
    let request = { limit, offset, time }

    let stakes
    do {
      let url = `${settings.INDEXER[network]}${apis[i]}`
      stakes = await _post(url, request) as Array<any>
      for (let stake of stakes) {
        if (!pAddress || stake.inputAddresses.some(
          (a: string) => pubk.equalPAddress(network, a, pAddress))
        ) {
          result.push({
            txId: stake.txID,
            type: types[i],
            address: stake.inputAddresses[0],
            nodeId: stake.nodeID,
            startTime: new Date(Date.parse(stake.startTime)),
            endTime: new Date(Date.parse(stake.endTime)),
            amount: new BN(stake.weight.toString()),
            feePercentage: stake.feePercentage ? parseInt(stake.feePercentage) / 1e4 : undefined
          })
        }
      }
      request.offset += limit
    } while (stakes.length == limit)
  }
  return result
}

export async function getAnyPTxId(network: string, pAddress: string): Promise<string | undefined> {
  let apis = ["imports/transactions", "delegators/transactions", "validators/transactions", "exports/transactions"]
  let limit = 0
  let offset = 0
  for (let api of apis) {
    let request = { pAddress, limit, offset }
    let response = await _post(`${settings.INDEXER[network]}${api}`, request)
    if (response.txIds && response.txIds.length > 0) {
      return response.txIds[0]
    }
  }
  return undefined
}

async function _post(url: string, request: PaginatedRequest): Promise<any> {
  let data = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });
  let response = await data.json() as Response
  if (response.errorMessage) {
    throw new Error(response.errorMessage)
  }
  return response.data
}