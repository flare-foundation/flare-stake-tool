import { BN } from "bn.js";
import * as settings from "../settings"
import * as utils from "../utils"
import { ClaimCStakeRewardTxParams, DelegatorPTxParams, ERC20TransferCTxParams, ExportCTxParams, ExportPTxParams, ImportCTxParams, ImportPTxParams, PStake, PStakeUTXO, UnwrapCTxParams, ValidatorPTxParams, WrapCTxParams } from "../flare/interfaces"
import { ClaimRewardParams, MoveCPParams, MovePCParams, StakeParams, TestSignature as MessageSignature, Wallet, WrapCParams, UnwrapCParams, ERC20Params, TxSettings } from "./interfaces";
import { utils as futils } from "@flarenetwork/flarejs";


export function defaultWallet(): Wallet {
    const zero = new BN(0)
    return {
        network: settings.DEFAULT_NETWORK,
        connection: "",
        bip44Path: settings.DEFAULT_BIP44_PATH,
        viewOnlyValue: "",
        publicKey: "",
        cAddress: "",
        pAddress: "",
        cBalance: zero,
        pBalance: zero,
        pcBalance: zero,
        cpBalance: zero,
        wcBalance: zero,
        cStake: zero,
        pStake: zero,
        pStakesOf: new Array<PStake>(),
        pStakeUTXOsOf: new Array<PStakeUTXO>(),
        pStakesTo: new Array<PStake>(),
        cReward: zero
    }
}

export function defaultTxSettings(): TxSettings {
    return {
        submitTx: true,
        exportSignedTx: false,
        copySignedTx: false,
        copyTxId: false,
        generateLegacyEvmTx: false,
        useEthSign: false
    }
}

export function defaultMoveCPParams(): MoveCPParams {
    return {
        amount: ""
    }
}

export function defaultMovePCParams(): MovePCParams {
    return {
        amount: ""
    }
}

export function defaultStakeParams(): StakeParams {
    let now = new Date()
    let min = 60 * 1000
    let minFromUnixEpoch = Math.round(now.getTime() / min)
    let start = new Date((minFromUnixEpoch + 5) * min);
    let end = new Date(start.getTime() + 14 * 24 * 60 * min)
    return {
        nodeId: "",
        amount: "",
        startTime: utils.dateToDateTimeLocalString(start),
        endTime: utils.dateToDateTimeLocalString(end),
        delegationFee: "",
        popBLSPublicKey: "",
        popBLSSignature: "",
        useConsumableUTXOs: true,
        useNonconsumableUTXOs: false,
        customUTXOs: new Set<string>()
    }
}

export function defaultClaimRewardParams(): ClaimRewardParams {
    return {
        recipient: "",
        amount: "",
        wrap: false
    }
}

export function defaultWrapCParams(): WrapCParams {
    return {
        amount: ""
    }
}

export function defaultERC20Params(): ERC20Params {
    return {
        tokenName: "custom",
        tokenAddress: "",
        recipient: "",
        amount: ""
    }
}

export function getExportCTxParams(
    network: string,
    publicKey: string,
    params: MoveCPParams
): ExportCTxParams {
    let amount = utils.flrToGwei(params.amount)
    return { network, publicKey, type: "EXPORT_CTX", amount, exportFee: new BN(0) }
}

export function getExportPTxParams(
    network: string,
    publicKey: string,
    params: MovePCParams
): ExportPTxParams {
    let amount = utils.flrToGwei(params.amount)
    return { network, publicKey, type: "EXPORT_PTX", amount }
}

export function getImportCTxParams(
    network: string,
    publicKey: string
): ImportCTxParams {
    return { network, publicKey, type: "IMPORT_CTX", importFee: new BN(0) }
}

export function getImportPTxParams(
    network: string,
    publicKey: string
): ImportPTxParams {
    return { network, publicKey, type: "IMPORT_PTX" }
}

export function getDelegatorPTxParams(
    network: string,
    publicKey: string,
    params: StakeParams
): DelegatorPTxParams {
    let nodeId = params.nodeId.trim()
    let amount = utils.flrToGwei(params.amount)
    let startTime = new BN(Math.round((new Date(params.startTime.trim())).getTime() / 1000))
    let endTime = new BN(Math.round((new Date(params.endTime.trim())).getTime() / 1000))
    let useConsumableUTXOs = params.useConsumableUTXOs
    let customUTXOs = Array.from(params.customUTXOs)
    return {
        network,
        publicKey,
        type: "DELEGATOR_PTX",
        nodeId,
        amount,
        startTime,
        endTime,
        useConsumableUTXOs,
        customUTXOs
    }
}

export function getValidatorPTxParams(
    network: string,
    publicKey: string,
    params: StakeParams
): ValidatorPTxParams {
    let nodeId = params.nodeId.trim()
    let amount = utils.flrToGwei(params.amount)
    let startTime = new BN(Math.round((new Date(params.startTime.trim())).getTime() / 1000))
    let endTime = new BN(Math.round((new Date(params.endTime.trim())).getTime() / 1000))
    let delegationFee = params.delegationFee ? parseFloat(params.delegationFee) : 0
    let popBLSPublicKey = futils.hexToBuffer(params.popBLSPublicKey.trim())
    let popBLSSignature = futils.hexToBuffer(params.popBLSSignature.trim())
    let useConsumableUTXOs = params.useConsumableUTXOs
    let customUTXOs = Array.from(params.customUTXOs)
    return {
        network,
        publicKey,
        type: "VALIDATOR_PTX",
        nodeId,
        amount,
        startTime,
        endTime,
        delegationFee,
        popBLSPublicKey,
        popBLSSignature,
        useConsumableUTXOs,
        customUTXOs
    }
}

export function getClaimCStakeRewardTxParams(
    network: string,
    publicKey: string,
    txType: number,
    params: ClaimRewardParams
): ClaimCStakeRewardTxParams {
    let recipient = params.recipient.trim()
    let amount = utils.flrToGwei(params.amount)
    let wrap = params.wrap
    return { network, publicKey, txType, type: "CLAIM_REWARD_CTX", recipient, amount, wrap }
}

export function getWrapCTxParams(
    network: string,
    publicKey: string,
    txType: number,
    params: WrapCParams
): WrapCTxParams {
    let amount = utils.flrToGwei(params.amount)
    return { network, publicKey, txType, type: "WRAP_CTX", amount }
}

export function getUnwrapCTxParams(
    network: string,
    publicKey: string,
    txType: number,
    params: UnwrapCParams
): UnwrapCTxParams {
    let amount = utils.flrToGwei(params.amount)
    return { network, publicKey, txType, type: "UNWRAP_CTX", amount }
}

export function getERC20TransferCTxParams(
    network: string,
    publicKey: string,
    txType: number,
    params: ERC20Params
): ERC20TransferCTxParams {
    let token = params.tokenAddress
    let recipient = params.recipient
    let amount = (new BN(params.amount)).mul((new BN(10)).pow(new BN(18)))
    return { network, publicKey, txType, type: "ERC20_CTX", token, recipient, amount }
}

export function getDefaultMessageSignature(): MessageSignature {
    return {
        message: "",
        hashedEthMsg: "",
        v: "",
        r: "",
        s: ""
    }
}