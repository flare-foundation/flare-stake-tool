import { PStake, PStakeUTXO } from "../flare/interfaces";
import BN from "bn.js";

export interface Wallet {
  network: string;
  connection: string;
  bip44Path: string;
  viewOnlyValue: string;
  publicKey: string;
  cAddress: string;
  pAddress: string;
  cBalance: BN;
  pBalance: BN;
  pcBalance: BN;
  cpBalance: BN;
  wcBalance: BN;
  cStake: BN;
  pStake: BN;
  pStakesOf: Array<PStake>;
  pStakeUTXOsOf: Array<PStakeUTXO>;
  pStakesTo: Array<PStake>;
  cReward: BN;
}

export interface TxSettings {
  submitTx: boolean;
  exportSignedTx: boolean;
  copySignedTx: boolean;
  copyTxId: boolean;
  generateLegacyEvmTx: boolean;
  useEthSign: boolean;
}

export interface MoveCPParams {
  amount: string;
}

export interface MovePCParams {
  amount: string;
}

export interface StakeParams {
  nodeId: string;
  amount: string;
  startTime: string;
  endTime: string;
  delegationFee: string;
  useConsumableUTXOs: boolean;
  useNonconsumableUTXOs: boolean;
  customUTXOs: Set<string>;
  popBLSPublicKey: string;
  popBLSSignature: string;
}

export interface ClaimRewardParams {
  recipient: string;
  amount: string;
  wrap: boolean;
}

export interface WrapCParams {
  amount: string;
}

export interface UnwrapCParams {
  amount: string;
}

export interface WrapCParams {
  amount: string;
}

export interface ERC20Params {
  tokenName: string;
  tokenAddress: string;
  recipient: string;
  amount: string;
}

export interface TestSignature {
  message: string;
  hashedEthMsg: string;
  v: string;
  r: string;
  s: string;
}
