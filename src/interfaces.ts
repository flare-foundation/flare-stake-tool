import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"

export interface SignData {
    requests: SignatureRequest[],
    transaction: string,
    unsignedTransaction: string
}

export interface UnsignedTxJson {
    serialization: string,
    signatureRequests: SignatureRequest[],
    unsignedTransactionBuffer: string // hex
  }