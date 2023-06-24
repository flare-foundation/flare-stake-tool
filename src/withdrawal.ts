import { contextFile } from './constants'
import { Transaction } from "ethers";
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { prefix0x, readSignedWithdrawalTx, readUnsignedWithdrawalTx, sleepms, unPrefix0x, waitFinalize3Factory } from "../src/utils"
import { saveUnsignedWithdrawalTx } from './utils'
import { UnsignedWithdrawalTxJson } from './interfaces';
import { Context } from 'vm';

export async function createWithdrawalTransaction(ctx: Context, toAddress: string, amount: number, id: string): Promise<string> {

    const nonce = await ctx.web3.eth.getTransactionCount(ctx.cAddressHex);

    var rawTx = {
        nonce: nonce,
        gasPrice: 500000000000,
        gasLimit: 8000000,
        to: toAddress,
        value: (amount * 10 ** 18).toString(),
        chainId: ctx.config.networkID
    }

    // serialized unsigned transaction
    const ethersTx = Transaction.from(rawTx)
    let hash = unPrefix0x(ethersTx.unsignedHash);

    const unsignedTx = <UnsignedWithdrawalTxJson> {
        rawTx: rawTx,
        message: hash
    }

    // save tx data
    saveUnsignedWithdrawalTx(unsignedTx, id);

    return id;
}

export async function sendSignedWithdrawalTransaction(ctx: Context, id: string): Promise<string> {

    const waitFinalize3 = waitFinalize3Factory(ctx.web3);

    // read unsigned tx data
    const unsignedTxJson = readUnsignedWithdrawalTx(id);

    // read signed tx data
    const signedTxJson = readSignedWithdrawalTx(id);


    // read signature
    const signature = signedTxJson.signature;


    // create raw signed tx
    const ethersTx = Transaction.from(unsignedTxJson.rawTx);
    ethersTx.signature = prefix0x(signature);
    const serializedSigned = ethersTx.serialized;

    // send signed tx to the network
    let receipt = await waitFinalize3(ctx.cAddressHex, () => ctx.web3.eth.sendSignedTransaction(serializedSigned));
    return receipt.transactionHash;
}


// createWithdrawalTransaction("ctx.json", "0xE01e4B85be84Fca554a36Af2F29A80247D88B2B4", 1.3, "w1")

// sendSignedWithdrawalTransaction("ctx.json", "w1");