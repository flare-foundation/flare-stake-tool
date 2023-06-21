import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"

export interface UnsignedTxJson {
    serialization: string,
    signatureRequests: SignatureRequest[],
    unsignedTransactionBuffer: string // hex
  }