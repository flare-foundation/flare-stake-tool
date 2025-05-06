import { Transaction, ZeroAddress } from "ethers";
import { prefix0x, unPrefix0x } from "../utils"
import { saveUnsignedEvmTx, readSignedEvmTx, readUnsignedEvmTx, waitFinalize3Factory, getWeb3Contract } from './utils'
import { UnsignedEvmTxJson } from '../interfaces';
import { Context } from 'vm';
import { distributionToDelegatorsABI, flareContractRegistryABI, flareContractRegistryAddress } from "../constants/contracts";

/**
 * @description Creates the withdrawal transaction and stores unsigned trx object in the file id
 * @param ctx - context
 * @param toAddress - the to address
 * @param amount - amount to be withdrawn
 * @param id - file id
 * @param nonce - nonce
 * @returns returns the file id
 */
export async function createWithdrawalTransaction(ctx: Context, toAddress: string, amount: number, id: string, nonce: number): Promise<string> {

    const web3 = ctx.web3;
    const txNonce = nonce ?? String(await web3.eth.getTransactionCount(ctx.cAddressHex));

    let amountWei = BigInt(amount) * BigInt(10 ** 9) // amount is already in nanoFLR

    // check if address is valid
    web3.utils.toChecksumAddress(toAddress);

    var rawTx = {
        nonce: txNonce,
        gasPrice: 200_000_000_000,
        gasLimit: 4_000_000,
        to: toAddress,
        value: amountWei.toString(),
        chainId: ctx.config.chainID
    }

    // serialized unsigned transaction
    const ethersTx = Transaction.from(rawTx)
    let hash = unPrefix0x(ethersTx.unsignedHash);

    const unsignedTx = <UnsignedEvmTxJson> {
        transactionType: 'EVM',
        rawTx: rawTx,
        message: hash,
        forDefiHash: Buffer.from(hash, 'hex').toString('base64')
    }
    // save tx data
    saveUnsignedEvmTx(unsignedTx, id);

    return id;
}

/**
 * @description Creates the opt out transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param id - file id
 * @param nonce - nonce
 * @returns returns the file id
 */
export async function createOptOutTransaction(ctx: Context, id: string, nonce: number): Promise<string> {

    const web3 = ctx.web3;

    const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
    const distributionToDelegatorsAddress = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("DistributionToDelegators").call();
    if (distributionToDelegatorsAddress == ZeroAddress) {
        throw new Error("Distribution contract address not found");
    }
    const txNonce = nonce ?? String(await ctx.web3.eth.getTransactionCount(ctx.cAddressHex));
    const distributionWeb3Contract = getWeb3Contract(ctx.web3, distributionToDelegatorsAddress, distributionToDelegatorsABI);
    const fnToEncode = distributionWeb3Contract.methods.optOutOfAirdrop();

    // check if address is already opt out candidate
    const isOptOutCandidate = await distributionWeb3Contract.methods.optOutCandidate(ctx.cAddressHex).call();
    if (isOptOutCandidate) {
        throw new Error("Already an opt out candidate");
    }


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

    const unsignedTx = <UnsignedEvmTxJson> {
        transactionType: 'EVM',
        rawTx: rawTx,
        message: hash,
        forDefiHash: Buffer.from(hash, 'hex').toString('base64')
    }
    // save tx data
    saveUnsignedEvmTx(unsignedTx, id);

    return id;
}

/**
 * @description - sends the EVM transaction to the blockchain
 * @param ctx - context
 * @param id - id of the file containing the unsigned transaction
 * @returns - the transaction hash
 */
export async function sendSignedEvmTransaction(ctx: Context, id: string): Promise<string> {

    const waitFinalize3 = waitFinalize3Factory(ctx.web3);

    // read unsigned tx data
    const unsignedTxJson = readUnsignedEvmTx(id);

    // read signed tx data
    const signedTxJson = readSignedEvmTx(id);

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