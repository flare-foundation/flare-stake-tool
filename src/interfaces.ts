import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"

export interface UnsignedTxJson {
  serialization: string,
  signatureRequests: SignatureRequest[],
  unsignedTransactionBuffer: string, // hex,
  forDefiTxId?: string
}

export interface SignedTxJson extends UnsignedTxJson {
  signature: string
}

export interface UnsignedWithdrawalTxJson {
  rawTx: WithdrawalTxData,
  message: string,
  forDefiTxId?: string
}

export interface SignedWithdrawalTxJson extends UnsignedWithdrawalTxJson {
  signature: string
}

interface WithdrawalTxData {
  nonce: number,
  gasPrice: number,
  gasLimit: number,
  to: string,
  value: string,
  chainId: number
}
