import Web3 from 'web3'
import { NetworkConfig } from './constants/network'
import { walletConstants } from './constants/screen'

export interface Context {
  privkHex?: string
  privkCB58?: string
  publicKey?: [Buffer, Buffer]
  rpcurl: string
  web3: Web3
  pAddressBech32?: string
  cAddressBech32?: string
  cAddressHex?: string
  config: NetworkConfig
  chainID: number,
  network?: string
}

export interface ContextFile {
  wallet: string
  publicKey: string
  network: string
  flareAddress?: string
  ethAddress?: string
  vaultId?: string
  derivationPath?: string
}

// temporary?
export interface SignatureRequest {
  message: string
  signer: string
}

export interface UnsignedTxJson {
  transactionType: string
  serialization: string
  signatureRequests: SignatureRequest[]
  unsignedTransactionBuffer: string // hex
  usedFee?: string // c-chain fee (don't know why is not logged inside buffer)
  txDetails?: string // JSON of the unsigned transaction
  forDefiTxId?: string
  forDefiHash?: string
}

export interface SignedTxJson extends UnsignedTxJson {
  signature: string
  isSentToChain?: boolean
}

export interface UnsignedEvmTxJson {
  transactionType: string
  rawTx: EvmTxData
  message: string
  forDefiTxId?: string
  forDefiHash?: string
}

export interface SignedEvmTxJson extends UnsignedEvmTxJson {
  signature: string
}

export interface FlareTxParams {
  amount?: string
  fee?: string
  nodeId?: string
  startTime?: string
  endTime?: string
  nonce?: string
  delegationFee?: string
  threshold?: string
  popBlsPublicKey?: string
  popBlsSignature?: string
}

interface EvmTxData {
  nonce: number
  gasPrice: number
  gasLimit: number
  to: string
  value?: string | bigint
  chainId: number
  data?: string
}

/**
 * Represents the various constants used by the CLI
 * @interface ScreenConstantsInterface
 */
export interface ScreenConstantsInterface {
  [key: string]: string
}

/**
 * Represents the properties returned from the "connectWallet" function
 * @interface ConnectWalletInterface
 */
export interface ConnectWalletInterface {
  wallet: string
  path?: string
  network?: string
}

/**
 * Represents a derived address from a Ledger device
 * @interface DerivedAddress
 */
export interface DerivedAddress {
  ethAddress: string
  publicKey: string
  balance?: string
  derivationPath: string
}

/**
 * Represents the properties returned from the "getDetailsForDelegation" function
 * @interface DelegationDetailsInterface
 */
export interface DelegationDetailsInterface {
  amount: string
  nodeId: string
  startTime: string
  endTime: string
  delegationFee?: string
  popBLSPublicKey?: string
  popBLSSignature?: string
}

/**
 * Represents constant used to store values for contract addresses
 * @interface ContractAddressesInterface
 */
export interface ContractAddressesInterface {
  [contractName: string]: {
    flare: string
    costwo: string
    songbird: string
    coston: string
  }
}
