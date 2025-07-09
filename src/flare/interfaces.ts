import { UnsignedTx, EVMUnsignedTx } from "@flarenetwork/flarejs"
import { LegacyTransaction as UnsignedEvmLegacyTx, FeeMarketEIP1559Transaction as UnsignedEvmEIP1559Tx } from "@ethereumjs/tx"
import BN from "bn.js"

export interface Account {
  network: string,
  publicKey: string,
  cAddress: string,
  pAddress: string
}

export interface AccountState {
  time: Date,
  cBalance: BN,
  pBalance: BN,
  pcBalance: BN,
  cpBalance: BN,
  wcBalance: BN,
  cStake: BN,
  pStake: BN,
  pStakesOf: Array<PStake>,
  pStakeUTXOsOf: Array<PStakeUTXO>,
  pStakesTo: Array<PStake>,
  cReward: BN
}

export interface PStake {
  txId: string,
  type: string,
  address: string,
  nodeId: string,
  startTime: Date,
  endTime: Date,
  amount: BN
  feePercentage: number | undefined
}

export interface PStakeUTXO {
  txId: string,
  availableFrom: Date,
  amount: BN
  serialization: string
}

export type TxType = {
  [key: string]: string
}

export const TX_TYPES: TxType = {
  EXPORT_CTX: "Export from C-chain",
  EXPORT_PTX: "Export from P-chain",
  IMPORT_CTX: "Import to C-chain",
  IMPORT_PTX: "Import to P-chain",
  DELEGATOR_PTX: "Add delegator to P-chain",
  VALIDATOR_PTX: "Add validator to P-chain",
  WRAP_CTX: "Wrap on C-chain",
  UNWRAP_CTX: "Unwrap on C-chain",
  ERC20_CTX: "ERC-20 token C-chain transfer",
  EVM_TX: "Standard C-chain transaction"
}

export interface EvmTx {
  to: string,
  data?: string,
  value?: bigint,
  gasLimit?: bigint,
  maxPriorityFeePerGas?: bigint,
  maxFeePerGas?: bigint,
  nonce?: number
}

export interface TxParams {
  network: string,
  publicKey: string,
  type: string,
}

export interface ExportCTxParams extends TxParams {
  amount: BN,
  exportFee?: BN
}

export interface ExportPTxParams extends TxParams {
  amount: BN
}

export interface ImportCTxParams extends TxParams {
  importFee?: BN
}

export type ImportPTxParams = TxParams

export interface StakePTxParams extends TxParams {
  nodeId: string,
  amount: BN,
  startTime: BN,
  endTime: BN,
  useConsumableUTXOs: boolean,
  customUTXOs: Array<string>
}

export type DelegatorPTxParams = StakePTxParams

export interface ValidatorPTxParams extends StakePTxParams {
  delegationFee: number,
  popBLSPublicKey: Uint8Array,
  popBLSSignature: Uint8Array,
}

export interface EvmTxParams extends TxParams {
  txType: number
}

export interface ClaimCStakeRewardTxParams extends EvmTxParams {
  recipient: string,
  amount: BN,
  wrap: boolean
}

export interface WrapCTxParams extends EvmTxParams {
  amount: BN
}

export interface UnwrapCTxParams extends EvmTxParams {
  amount: BN
}

export interface ERC20TransferCTxParams extends EvmTxParams {
  token: string,
  recipient: string,
  amount: BN
}

export interface TxDetails extends TxParams {
  unsignedTxHex: string,
  unsignedTxHash?: string
  isEvmTx: boolean
}

export interface ExportCTxDetails extends TxDetails, ExportCTxParams {
  importFeeReservation: BN
}

export interface ExportPTxDetails extends TxDetails, ExportPTxParams {
  exportFee: BN
}

export interface ImportCTxDetails extends TxDetails, ImportCTxParams {
  amount: BN
}

export interface ImportPTxDetails extends TxDetails, ImportPTxParams {
  amount: BN,
  importFee: BN
}

export interface DelegatorPTxDetails extends TxDetails, DelegatorPTxParams { }

export interface ValidatorPTxDetails extends TxDetails, ValidatorPTxParams { }

export interface EvmTxDetails extends TxDetails, EvmTxParams, EvmTx { }

export interface TxSummary {
  network: string,
  type: string,
  publicKey: string,
  unsignedTx: string,
  unsignedTxHash: string,
  signature: string,
  signedTx: string
}

export interface Sign {
  (request: TxDetails): Promise<string>
}

export interface PreSubmit {
  (request: TxSummary): Promise<boolean>
}

export interface UnsignedTxData {
  txDetails: ExportCTxDetails | ExportPTxDetails | ImportCTxDetails | ImportPTxDetails | DelegatorPTxDetails | ValidatorPTxDetails | EvmTxDetails,
  unsignedTx: UnsignedTx | EVMUnsignedTx | UnsignedEvmLegacyTx | UnsignedEvmEIP1559Tx
}

export interface SignedTxData extends UnsignedTxData {
  signature: string,
  signedTx: string
}

export interface SubmittedTxData extends SignedTxData {
  id: string,
  status: string,
  submitted: boolean,
  confirmed: boolean
}

export interface EcdsaSignature {
  r: BN,
  s: BN,
  recoveryParam: number
}

export interface CurrentValidatorData {
  accruedDelegateeReward: string;
  txID: string;
  startTime: string;
  endTime: string;
  stakeAmount: string;
  nodeID: string;
  weight: string;
  validationRewardOwner: {
    locktime: string;
    threshold: string;
    addresses: string[];
  };
  delegatorCount: string;
  delegatorWeight: string;
  potentialReward: string;
  delegationFee: string;
  uptime: string;
  connected: boolean;
  delegators: CurrentDelegatorData[];
};

export interface CurrentDelegatorData {
  txID: string;
  startTime: string;
  endTime: string;
  stakeAmount: string;
  nodeID: string;
  delegationRewardOwner: {
    locktime: string;
    threshold: string;
    addresses: string[];
  };
  rewardOwner: {
    locktime: string;
    threshold: string;
    addresses: string[];
  };
  potentialReward: string;
}

export interface PendingValidatorData {
    txID: string;
    startTime: string;
    endTime: string;
    stakeAmount: string;
    nodeID: string;
    delegationFee: string;
    connected: boolean;
    weight: string;
  delegators: PendingDelegatorData[];
};

export interface PendingDelegatorData {
    txID: string;
    startTime: string;
    endTime: string;
    stakeAmount: string;
    nodeID: string;
}