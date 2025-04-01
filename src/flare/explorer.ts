import * as settings from "../settings"
import { equalCAddress } from "./pubk"

interface Response {
    result: any,
    message: string,
    status: string
}

export async function getCTxIds(network: string, cAddress: string): Promise<string[]> {
    let explorerUrl = settings.EXPLORER[network]
    let txs = await _get(`${explorerUrl}api?module=account&action=txlist&address=${cAddress}`)
    return txs
        .filter((tx: { from: string }) => equalCAddress(tx.from, cAddress))
        .map((tx: { hash: any }) => tx.hash)
}

async function _get(url: string): Promise<any> {
    let data = await fetch(url)
    let response = await data.json() as Response
    if (response.status !== "1") {
        throw new Error(response.message)
    }
    return response.result
}