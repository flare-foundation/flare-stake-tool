import TrezorConnect from "@trezor/connect-web";
import * as utils from "../utils";
import { FeeMarketEIP1559Transaction, LegacyTransaction, TransactionFactory } from "@ethereumjs/tx";

// Interfaces for Trezor transaction input
interface BaseTxInput {
  to: string;
  value: string;
  data: string;
  nonce: string;
  gasLimit: string;
  chainId: number;
}

interface LegacyTxInput extends BaseTxInput {
  gasPrice: string;
}

interface EIP1559TxInput extends BaseTxInput {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

type TxInput = LegacyTxInput | EIP1559TxInput;

let initialized = false

export async function getPublicKey(bip44Path: string): Promise<string> {
    _initialize()

    let response = await TrezorConnect.getPublicKey({ path: bip44Path, showOnTrezor: false });
    if (response.success) {
        return response.payload.publicKey
    } else {
        throw Error(`Failed to obtain public key from trezor: ${response.payload.error}, code ${response.payload.code}`)
    }
}

export async function ethereumSignMessage(bip44Path: string, message: string): Promise<string> {
    _initialize()

    let response = await TrezorConnect.ethereumSignMessage({ path: bip44Path, message: message, hex: false })
    if (response.success) {
        let signature = utils.toHex(response.payload.signature, true)
        return signature
    } else {
        throw new Error(`Failed to sign message on trezor: ${response.payload.error}, code ${response.payload.code}`)
    }
}

export async function signEvmTransaction(bip44Path: string, txHex: string): Promise<string> {
    _initialize()

    let tx = TransactionFactory.fromSerializedData(utils.toBuffer(txHex))
    let btx = {
        to: tx.to ? tx.to.toString() : "0x0",
        value: tx.value.toString(16),
        data: utils.toHex(tx.data, true),
        nonce: tx.nonce.toString(16),
        gasLimit: tx.gasLimit.toString(16)
    }
    let transaction: TxInput
    let chainId: number
    if (tx instanceof LegacyTransaction) {
        chainId = Number(tx.v!)
        transaction = {
            ...btx,
            gasPrice: tx.gasPrice.toString(16),
            chainId
        }
    } else if (tx instanceof FeeMarketEIP1559Transaction) {
        chainId = Number(tx.chainId)
        transaction = {
            ...btx,
            maxFeePerGas: tx.maxFeePerGas.toString(16),
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(16),
            chainId
        }
    } else {
        throw new Error("Unsupported EVM transaction type")
    }
    let response = await TrezorConnect.ethereumSignTransaction({
        path: bip44Path,
        transaction
    })
    if (response.success) {
        let r = Buffer.from(utils.toHex(response.payload.r, false), "hex")
        let s = Buffer.from(utils.toHex(response.payload.s, false), "hex")
        let recoveryParam = parseInt(utils.toHex(response.payload.v, false), 16)
        if (recoveryParam > 28) {
            recoveryParam -= 8 + 2*chainId
        }
        if (recoveryParam == 0 || recoveryParam == 1) {
            recoveryParam += 27
        }
        let v = Buffer.from(recoveryParam.toString(16), "hex")
        let signature = utils.toHex(Buffer.concat([r, s, v]), false)
        return signature
    } else {
        throw new Error(`Failed to sign EVM transaction on trezor: ${response.payload.error}, code ${response.payload.code}`)
    }
}

function _initialize() {
    if (!initialized)
        TrezorConnect.init({
            lazyLoad: true,
            manifest: {
                email: 'developer@xyz.com',
                appUrl: 'http://your.application.com',
            },
        })
        .then(() => {
          initialized = true
        })
        .catch((error) => {
          throw new Error(`Failed to initialize Trezor Connect: ${error}`);
        });

}