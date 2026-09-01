import Web3 from "web3";
import { NetworkConfig } from "./constants/network";

export interface Context {
  privkHex?: string | undefined;
  privkCB58?: string | undefined;
  publicKey?: [Buffer, Buffer] | undefined;
  rpcurl: string;
  web3: Web3;
  pAddressBech32?: string | undefined;
  cAddressBech32?: string | undefined;
  cAddressHex?: string | undefined;
  config: NetworkConfig;
  chainID: number;
  network?: string | undefined;
}

export interface ContextFile {
  wallet: string;
  publicKey: string;
  network: string;
  flareAddress?: string | undefined;
  ethAddress?: string | undefined;
  vaultId?: string | undefined;
  derivationPath?: string | undefined;
}

// temporary?
export interface SignatureRequest {
  message: string;
  signer: string;
}

export interface UnsignedTxJson {
  transactionType: string;
  serialization: string;
  signatureRequests: SignatureRequest[];
  unsignedTransactionBuffer: string; // hex
  usedFee?: string | undefined; // C-chain fee (don't know why is not logged inside buffer)
  txDetails?: string | undefined; // JSON of the unsigned transaction
  forDefiTxId?: string | undefined;
  forDefiHash?: string | undefined;
}

export interface SignedTxJson extends UnsignedTxJson {
  signature: string;
  isSentToChain?: boolean | undefined;
}

export interface UnsignedEvmTxJson {
  transactionType: string;
  rawTx: EvmTxData;
  message: string;
  forDefiTxId?: string | undefined;
  forDefiHash?: string | undefined;
}

export interface SignedEvmTxJson extends UnsignedEvmTxJson {
  signature: string;
}

export interface FlareTxParams {
  amount?: string | undefined;
  fee?: string | undefined;
  nodeId?: string | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  nonce?: string | undefined;
  delegationFee?: string | undefined;
  threshold?: string | undefined;
  popBlsPublicKey?: string | undefined;
  popBlsSignature?: string | undefined;
  transferAddress?: string | undefined;
  feeMultiplier?: string | undefined;
}

interface EvmTxData {
  nonce: number;
  type?: number | undefined;
  /**
   * Set only on transactions written by versions that omitted the type field.
   * ethers resolves those to EIP-2930 (type 1), which is what they were signed
   * as, so the field must stay absent rather than be defaulted to 0.
   */
  gasPrice?: number | undefined;
  maxFeePerGas?: number | undefined;
  maxPriorityFeePerGas?: number | undefined;
  gasLimit: number;
  to: string;
  value?: string | bigint | undefined;
  chainId: number;
  data?: string | undefined;
}

/**
 * Represents the various constants used by the CLI
 * @interface ScreenConstantsInterface
 */
export interface ScreenConstantsInterface {
  [key: string]: string;
}

/**
 * Represents the properties returned from the "connectWallet" function
 * @interface ConnectWalletInterface
 */
export interface ConnectWalletInterface {
  wallet: string;
  path?: string | undefined;
  network?: string | undefined;
}

/**
 * Represents a derived address from a Ledger device
 * @interface DerivedAddress
 */
export interface DerivedAddress {
  ethAddress: string;
  publicKey: string;
  balance?: string;
  derivationPath: string;
}

/**
 * Represents the properties returned from the "getDetailsForDelegation" function
 * @interface DelegationDetailsInterface
 */
export interface DelegationDetailsInterface {
  amount: string;
  nodeId: string;
  startTime: string;
  endTime: string;
  delegationFee?: string;
  popBLSPublicKey?: string;
  popBLSSignature?: string;
}

/**
 * Represents constant used to store values for contract addresses
 * @interface ContractAddressesInterface
 */
export interface ContractAddressesInterface {
  [contractName: string]: {
    flare: string;
    costwo: string;
    songbird: string;
    coston: string;
  };
}

export interface TransferDetailsInterface {
  amount: string;
  transferAddress: string;
}
