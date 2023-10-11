import { Transaction } from "ethers";
import { prefix0x, unPrefix0x } from "../utils"
import { getWeb3Contract } from "./utils"
import { saveUnsignedWithdrawalTx, readSignedWithdrawalTx, readUnsignedWithdrawalTx, waitFinalize3Factory } from './utils'
import { UnsignedWithdrawalTxJson } from '../interfaces';
import { Context } from 'vm';

const distributionAbi = [{
  "type": "function",
  "stateMutability": "nonpayable",
  "outputs": [],
  "name": "optOutOfAirdrop",
  "inputs": []
}]

/**
 * @description Creates the opt out transaction and stores unsigned trx object in the file id that was passed
 * @param ctx - context
 * @param id - file id
 * @param nonce - nonce
 * @returns returns the file id
 */
export async function createOptOutTransaction(ctx: Context, id: string, nonce: number): Promise<string> {

    const distributionAddress = ctx.config.networkID == 14
      ? "0x9c7A4C83842B29bB4A082b0E689CB9474BD938d0"
      : "0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010";

    const txNonce = nonce ?? await ctx.web3.eth.getTransactionCount(ctx.cAddressHex);
    const distributionWeb3Contract = getWeb3Contract(ctx.web3, distributionAddress, distributionAbi);
    const fnToEncode = distributionWeb3Contract.methods.optOutOfAirdrop();

    const rawTx = {
        nonce: txNonce,
        gasPrice: 200_000_000_000,
        gasLimit: 4_000_000,
        to: distributionWeb3Contract.options.address,
        data: fnToEncode.encodeABI(),
        chainId: ctx.config.networkID
    }

    // serialized unsigned transaction
    const ethersTx = Transaction.from(rawTx)
    const hash = unPrefix0x(ethersTx.unsignedHash);

    const unsignedTx = <UnsignedWithdrawalTxJson> {
        rawTx: rawTx,
        message: hash,
        forDefiHash: Buffer.from(hash, 'hex').toString('base64')
    }
    // save tx data
    saveUnsignedWithdrawalTx(unsignedTx, id);

    return id;
}

/**
 * @description - sends the opt out transaction to the blockchain
 * @param ctx - context
 * @param id - id of the file containing the unsigned transaction
 * @returns - the transaction hash
 */
export async function sendSignedOptOutTransaction(ctx: Context, id: string): Promise<string> {

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
    const receipt = await waitFinalize3(ctx.cAddressHex, () => ctx.web3.eth.sendSignedTransaction(serializedSigned));
    return receipt.transactionHash;
}