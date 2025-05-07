import * as settings from '../settings'
import * as utils from '../utils'
import * as pubk from './pubk'
import * as txs from './txs'
import * as explorer from './explorer'
import * as indexer from './indexer'
import BN from 'bn.js'
import { pvm, evm, utils as futils, Utxo, pvmSerial } from '@flarenetwork/flarejs'
import Web3 from 'web3'
import { PStake, PStakeUTXO } from './interfaces'
import { getContext } from './context'

export function getWeb3(network: string): Web3 {
  let web3 = new Web3(settings.RPC[network])
  return web3
}

export async function getCBalance(network: string, cAddress: string): Promise<BN> {
  let balance = await getWeb3(network).eth.getBalance(cAddress)
  return utils.weiToGwei(balance)
}

export async function getPBalance(network: string, pAddress: string): Promise<BN> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  const { balance } = await pvmapi.getBalance({ addresses: [pAddress] })
  return new BN(balance.toString())
}

export async function getPCBalance(network: string, pAddress: string): Promise<BN> {
  const evmapi = new evm.EVMApi(settings.URL[network])
  const context = await getContext(network)
  const { utxos } = await evmapi.getUTXOs({
    addresses: [`C-${pAddress.slice(2)}`],
    sourceChain: context.pBlockchainID
  })
  return sumUtxoTransferableOutputs(utxos)
}

export async function getCPBalance(network: string, pAddress: string): Promise<BN> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  const context = await getContext(network)
  const { utxos } = await pvmapi.getUTXOs({
    addresses: [pAddress],
    sourceChain: context.cBlockchainID
  })
  return sumUtxoTransferableOutputs(utxos)
}

export async function getPStake(network: string, pAddress: string): Promise<BN> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  const { staked } = await pvmapi.getStake({ addresses: [pAddress] })
  return new BN(staked.toString())
}

export async function getPStakes(network: string): Promise<Array<PStake>> {
  let stakes = Array<PStake>()
  stakes = stakes.concat(await getCurrentPStakes(network))
  stakes = stakes.concat(await getPendingPStakes(network))
  return stakes
}

export async function getCurrentPStakes(network: string): Promise<Array<PStake>> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  const { validators } = await pvmapi.getCurrentValidators()
  const stakes = Array<PStake>()
  for (let validator of validators) {
    stakes.push(await _parsePStake(network, validator, 'validator'))
    let delegators = validator.delegators as Array<any>
    if (delegators) {
      for (let delegator of delegators) {
        stakes.push(await _parsePStake(network, delegator, 'delegator'))
      }
    }
  }
  return stakes
}

export async function getPendingPStakes(network: string): Promise<Array<PStake>> {
  const pvmapi = new pvm.PVMApi(settings.URL[network])
  const { validators, delegators } = await pvmapi.getPendingValidators()
  const stakes = Array<PStake>()
  for (let validator of validators) {
    stakes.push(await _parsePStake(network, validator, 'validator'))
  }
  for (let delegator of delegators) {
    stakes.push(await _parsePStake(network, delegator, 'delegator'))
  }
  return stakes
}

export async function getPStakesOf(
  network: string,
  pAddress: string,
  stakes?: Array<PStake>
): Promise<Array<PStake>> {
  if (!stakes) {
    stakes = await getPStakes(network)
  }
  return stakes.filter((s) => pubk.equalPAddress(network, s.address, pAddress))
}

export async function getPStakesTo(
  network: string,
  pAddress: string,
  stakes?: Array<PStake>
): Promise<Array<PStake>> {
  if (!stakes) {
    stakes = await getPStakes(network)
  }
  let nodeIds = stakes
    .filter((s) => s.type === 'validator' && pubk.equalPAddress(network, s.address, pAddress))
    .map((s) => s.nodeId)
  return stakes.filter((s) => nodeIds.includes(s.nodeId))
}

async function _parsePStake(network: string, stake: any, type: string): Promise<PStake> {
  let address: string
  if (stake.rewardOwner && stake.rewardOwner.addresses && stake.rewardOwner.addresses.length > 0) {
    address = stake.rewardOwner.addresses[0]
  } else {
    let tx = await txs.getStakeTransaction(network, stake.txID)
    if (tx instanceof pvmSerial.AddDelegatorTx || tx instanceof pvmSerial.AddValidatorTx) {
      address = tx.getRewardsOwner().addrs[0].toHex()
    } else if (tx instanceof pvmSerial.AddPermissionlessDelegatorTx) {
      address = tx.getDelegatorRewardsOwner().addrs[0].toHex()
    } else if (tx instanceof pvmSerial.AddPermissionlessValidatorTx) {
      address = tx.getValidatorRewardsOwner().addrs[0].toHex()
    } else {
      throw new Error('Unknown stake transaction type')
    }
  }
  address = pubk.normalizePAddress(network, address)
  return {
    txId: stake.txID,
    type: type,
    address: address,
    nodeId: stake.nodeID,
    startTime: new Date(parseInt(stake.startTime) * 1e3),
    endTime: new Date(parseInt(stake.endTime) * 1e3),
    amount: new BN(stake.stakeAmount),
    feePercentage: stake.delegationFee ? parseFloat(stake.delegationFee) : undefined
  }
}

export async function getUTXOsFromPStakes(
  _network: string,
  _pAddress: string,
  _stakes?: Array<PStake>
): Promise<Array<PStakeUTXO>> {
  // if (!stakes) {
  //     stakes = await getPStakes(network)
  // }
  // const pvmapi = new pvm.PVMApi(settings.URL[network]);

  // let utxos = new Array<PStakeUTXO>()
  // for (let stake of stakes) {
  //     const stx = await pvmapi.getTx({ txID: stake.txId })

  //     // let txHex = (await avajs.PChain().getTx(stake.txId, "hex")) as string
  //     let tx = new Tx()
  //     tx.fromBuffer(utils.toBuffer(txHex) as any)
  //     let stakeTx = tx.getUnsignedTx().getTransaction() as AddDelegatorTx
  //     let outcount = stakeTx.getOuts().length
  //     let stakeOutputs = stakeTx.getStakeOuts();
  //     for (let i = 0; i < stakeOutputs.length; i++) {
  //         let stakeOutput = stakeOutputs[i]
  //         let output = stakeOutput.getOutput() as AmountOutput
  //         let addresses = output.getAddresses()
  //         if (!addresses.some(a => pubk.equalPAddress(network, utils.toHex(a), pAddress))) {
  //             continue
  //         }
  //         let utxo = new UTXO(
  //             undefined,
  //             utils.toBuffer(stake.txId) as any,
  //             outcount + i,
  //             stakeOutput.getAssetID(),
  //             output
  //         )
  //         utxos.push({
  //             txId: stake.txId,
  //             availableFrom: stake.endTime,
  //             amount: output.getAmount(),
  //             serialization: utils.toHex(utxo.toBuffer(), false)
  //         })
  //     }
  // }
  // return utxos
  return []
}

export async function getAnyCTx(network: string, cAddress: string): Promise<any> {
  let txIds = await explorer.getCTxIds(network, cAddress)
  if (txIds.length > 0) {
    let tx = (await getWeb3(network).eth.getTransaction(txIds[0])) as any
    return tx
  }
  return undefined
}

export async function getAnyPTx(network: string, pAddress: string) {
  let stakes = await getPStakesOf(network, pAddress)
  let txId = undefined
  if (stakes.length > 0) {
    txId = stakes[0].txId
  } else {
    txId = await indexer.getAnyPTxId(network, pAddress)
  }
  if (txId) {
    const pvmapi = new pvm.PVMApi(settings.URL[network])
    return pvmapi.getTx({ txID: txId })
  }
  return undefined
}

export async function getCTxBaseFee(network: string): Promise<BN> {
  // let avajs = getAvalanche(network)
  // let feeWei = new BN(utils.toHex(await avajs.CChain().getBaseFee(), false), "hex")
  let feeEstimate = await estimateEIP1559Fee(network)
  let feeWei = feeEstimate[0] - feeEstimate[1]
  return utils.weiToGweiCeil(feeWei)
}

export async function estimateEIP1559Fee(network: string): Promise<[bigint, bigint]> {
  let web3 = getWeb3(network)
  let feeHistory = await web3.eth.getFeeHistory(4, 'latest', ['10', '50'])

  let baseFee = BigInt(0)
  let gasUsedRatio = 0
  let priorityFee10 = BigInt(0)
  let priorityFee50 = BigInt(0)
  for (let i = 0; i < 4; i++) {
    let factor = BigInt(10 * (i + 1))
    baseFee += factor * BigInt((feeHistory.baseFeePerGas as any)[i])
    gasUsedRatio += (feeHistory.gasUsedRatio as any)[i]
    priorityFee10 += factor * BigInt((feeHistory.reward as any)[i][0])
    priorityFee50 += factor * BigInt((feeHistory.reward as any)[i][1])
  }
  baseFee = baseFee / BigInt(100)
  let priorityFee = (gasUsedRatio / 4 < 0.9 ? priorityFee10 : priorityFee50) / BigInt(100)
  let maxFee = BigInt(2) * baseFee + priorityFee

  return [maxFee, priorityFee]
}

export async function numberOfCTxs(network: string, cAddress: string): Promise<number> {
  let web3 = getWeb3(network)
  let nonce = await web3.eth.getTransactionCount(cAddress)
  return Number(nonce)
}

export async function getPTxDefaultFee(network: string): Promise<BN> {
  const context = await getContext(network)
  return new BN(context.baseTxFee.toString())
}

//function _getChainId(network: string): number {
//    let value = settings.CHAIN_ID[network]
//    let chainId = parseInt(value)
//    if (isNaN(chainId)) {
//        chainId = parseInt(value, 16)
//    }
//    return chainId
//}

function sumUtxoTransferableOutputs(utxos: Array<Utxo>): BN {
  let balance = 0n
  for (let utxo of utxos) {
    const out = utxo.output
    if (futils.isTransferOut(out)) {
      balance += out.amount()
    }
  }
  return new BN(balance.toString())
}
