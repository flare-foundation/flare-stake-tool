import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"

export interface SignData {
    requests: SignatureRequest[],
    transaction: string
}

export interface CompressedSignatureRequest extends SignatureRequest {
    indices: number[]
}