import * as settings from '../settings'
import * as utils from '../utils'
import * as pubk from './pubk'
import * as txs from './txs'
import BN from 'bn.js'
import { pvm, evm, utils as futils, Utxo, pvmSerial } from '@flarenetwork/flarejs'
import Web3 from 'web3'
import { CurrentDelegatorData, CurrentValidatorData, PendingDelegatorData, PendingValidatorData, PStake } from './interfaces'
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
    let delegators = validator.delegators as Array<CurrentDelegatorData>
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

async function _parsePStake(network: string, stake: CurrentDelegatorData | CurrentValidatorData | PendingDelegatorData | PendingValidatorData, type: string): Promise<PStake> {
  let address: string
  if ("validationRewardOwner" in stake && stake.validationRewardOwner.addresses && stake.validationRewardOwner.addresses.length > 0) {
      address = stake.validationRewardOwner.addresses[0]
  } else if ("delegationRewardOwner" in stake && stake.delegationRewardOwner.addresses && stake.delegationRewardOwner.addresses.length > 0) {
      address = stake.delegationRewardOwner.addresses[0]
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
    feePercentage: "delegationFee" in stake ? parseFloat(stake.delegationFee) : undefined
  }
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
  let gasUsedRatio = BigInt(0)
  let priorityFee10 = BigInt(0)
  let priorityFee50 = BigInt(0)
  for (let i = 0; i < 4; i++) {
    let factor = BigInt(10 * (i + 1))
    baseFee += factor * BigInt((feeHistory.baseFeePerGas)[i])
    gasUsedRatio += (feeHistory.gasUsedRatio)[i]
    priorityFee10 += factor * BigInt((feeHistory.reward)[i][0])
    priorityFee50 += factor * BigInt((feeHistory.reward)[i][1])
  }
  baseFee = baseFee / BigInt(100)
  let priorityFee = (gasUsedRatio / 4n < BigInt(0.9) ? priorityFee10 : priorityFee50) / BigInt(100)
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
