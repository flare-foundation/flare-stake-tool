const keccak256 = require('@ethersproject/keccak256').keccak256;
const ripemd160 = require('ripemd160-js');
const sha256 = require('js-sha256');
const bech32 = require('bech32').bech32;
const binary_to_base58 = require('base58-js').binary_to_base58;

const fs = require('fs');
const path = require('path');

import BN from "bn.js"

import { Avalanche } from "@flarenetwork/flarejs/dist";
import { Signature } from "@flarenetwork/flarejs/dist/common";
import { SECPCredential } from "@flarenetwork/flarejs/dist/apis/evm";
import { Tx as pTx, UnsignedTx as pUnsignedTx } from "@flarenetwork/flarejs/dist/apis/platformvm/tx";
import { SECPOwnerOutput } from "@flarenetwork/flarejs/dist/apis/platformvm";
import { Tx as cTx } from "@flarenetwork/flarejs/dist/apis/evm/tx";
import { Defaults, costExportTx, UnixNow, costImportTx, NodeIDStringToBuffer } from '@flarenetwork/flarejs/dist/utils'
import { FireblocksSDK, PeerType, TransactionOperation, TransactionStatus } from 'fireblocks-sdk';

const Web3 = require('web3');
const { SECPTransferOutput, TransferableOutput, SECPTransferInput, TransferableInput, ExportTx, ParseableOutput, AmountOutput, AddDelegatorTx } =
require('avalanche/dist/apis/platformvm');
const { BinTools } = require('avalanche');

import { contextEnv } from "../src/constants";
import { UnsignedTx } from "@flarenetwork/flarejs/dist/apis/avm";

// Fireblocks AUTH params
const apiSecret = fs.readFileSync(path.resolve("<api_secret_key_path>"), "utf8");
const apiKey = "<api_key>";

const ctx = contextEnv("./.env", "costwo")

// Some constants
const assetId = "AVAXTEST";

const amountToTransfer = new BN(1000000000); // 1 AVAX
const WeiTonAVAX = (wei: any) => { return wei * (Math.pow(10, -9)); }

let fbks = new FireblocksSDK(apiSecret, apiKey);
let account: any;

async function getTxCountFor() {
    let addresses = await fbks.getDepositAddresses(2, assetId);
    let web3 = new Web3('https://api.avax-test.network/ext/bc/C/rpc');
    let txCount = await web3.eth.getTransactionCount(addresses[0].address);
    return txCount;
}


// Creates a c-chain to p-chain export transaction to transfer funds cross chain.
// I wrote this with two runs required for some reason.
// The first one will generate a normal export transaction with the base fee
// The second one will generate an export transaction but set a proper fee depending on the size of the first tx.
async function build_c2p_export_tx(badFeeTx = undefined) {
    const baseFee = new BN(WeiTonAVAX(parseInt(await ctx.cchain.getBaseFee(), 16)));
    let nonce = await getTxCountFor();
    let avaxAmount = amountToTransfer.sub(baseFee);

    if (badFeeTx === undefined) {
        let unsignedTx = await ctx.cchain.buildExportTx(
            avaxAmount,
            ctx.avaxAssetID,
            ctx.pChainBlockchainID,
            ctx.cAddressHex,
            ctx.cAddressBech32!,
            [ctx.pAddressBech32!],
            nonce,
            new BN(0),
            1,
            baseFee,
        );

        return unsignedTx;
    } else {
        // Calc expected fee for export
        let exportCost = new BN(costExportTx(badFeeTx));
        let fee = baseFee.mul(exportCost);
        avaxAmount = amountToTransfer.sub(fee);

        let unsignedTx = await ctx.cchain.buildExportTx(
            avaxAmount,
            ctx.avaxAssetID,
            ctx.pChainBlockchainID,
            ctx.cAddressHex,
            ctx.cAddressBech32!,
            [ctx.pAddressBech32!],
            nonce,
            new BN(0),
            1,
            fee
        );

        return unsignedTx;
    }
}

// Signs a transaction using fireblocks raw signing \ contract call.
// unsignedTx is the tx to sign
// isPTx is a boolean to know if it's a P-chain tx (different signature required).
// override is a boolean to indicate whetehr we should consider a transacations ins (utxos) and "forge" new signatures for the same number of ins (not request new ones, use the same signature).
async function signTx(unsignedTx: UnsignedTx, isPTx: boolean, override = false) {
    //TODO: Fix multiple ins\outs.
    let txBuffer = unsignedTx.toBuffer();
    let txHashed = sha256.sha256.create().update(txBuffer).hex();
    let txPayload;

    if (isPTx) {
        // Raw signing for P-Chain
        let extraParams = {
            "rawMessageData": {
                "messages": [
                    {
                        content: txHashed,
                        derivationPath: [44, 1, 2, 0, 0]
                    }
                ],
                "algorithm": "MPC_ECDSA_SECP256K1"
            }
        };
        txPayload = {
            operation: TransactionOperation.RAW,
            extraParameters: extraParams
        };
    } else {
        // Raw signing for C-Chain
        let extraParams = {
            "rawMessageData": {
                "messages": [
                    {
                        content: txHashed
                    }
                ]
            }
        };
        txPayload = {
            assetId: assetId,
            source: {
                type: PeerType.VAULT_ACCOUNT,
                id: account.id
            },
            operation: TransactionOperation.RAW,
            extraParameters: extraParams
        };
    };

    let signed = await fbks.createTransaction(txPayload);
    let txId = signed.id;

    let tx = await fbks.getTransactionById(txId);
    console.log('Waiting for transaction to be signed.');
    while (tx.status !== TransactionStatus.COMPLETED) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        tx = await fbks.getTransactionById(txId);
        if (tx.status === TransactionStatus.BLOCKED || tx.status === TransactionStatus.CANCELLED || tx.status === TransactionStatus.FAILED) {
            throw new Error("Signing request failed.");
        }
        console.log('Waiting for transaction to be signed.');
    }

    let fullSig = tx.signedMessages[0].signature['r'] + tx.signedMessages[0].signature['s'];
    console.log(`Signature: ${fullSig + (tx.signedMessages[0].signature.v === 1 ? '01' : '00')}`);
    console.log(`Msg Hex: ${txHashed}`);

    // Create signature array for transaction.
    const creds = [];
    let cred = new SECPCredential();
    let sig = new Signature();
    let sigString = Buffer.from(fullSig + (tx.signedMessages[0].signature.v === 1 ? '01' : '00'), 'hex');
    console.log(`${Buffer.from(sigString).toString('hex')}`)
    sig.fromString(binary_to_base58(sigString)); //ew base58
    cred.addSignature(sig);
    creds.push(cred);

    // Only ctx.pchain tx or override need to potentially add new transactions.
    if (isPTx || override) {
        if(unsignedTx.transaction.ins !== undefined){
            for (let i = 0; i < unsignedTx.transaction.ins.length - 1; i++) {
                creds.push(cred);
            }
        }
        // New P-Chain tx signed
        let signedTx = new pTx(unsignedTx, creds);
        return signedTx;
    }
    // IF we're importing utxos (i.e. export from p-chain import on c-chain) also "forge" transactions
    if (unsignedTx.transaction.importIns !== undefined) {
        for (let i = 0; i < unsignedTx.transaction.importIns.length - 1; i++) {
            creds.push(cred);
        }
    }

    // New C-chain tx signed
    let signedTx = new cTx(unsignedTx, creds);
    return signedTx;
}

// Builds an import from c-chain to p chain (i.e. we exported from c-chain and now we want to import on p-chain).
async function build_c2p_import_tx(utxoSet) {
    let tx = await ctx.pchain.buildImportTx(
        utxoSet,
        [ctx.pAddressBech32!],
        ctx.cChainBlockchainID,
        [ctx.pAddressBech32!],
        [ctx.pAddressBech32!],
        [ctx.pAddressBech32!],
        Buffer.from(""),
        UnixNow(),
        new BN(0),
        1
    )
    return tx;
}

// Creates an export from p-chain to c-chain for the entire balance of p-chain.
async function build_p2c_export_tx() {
    const fee = ctx.pchain.getDefaultTxFee();
    const signerThreshold = 1;
    const lockTime = new BN(0);
    const memo = Buffer.from("");

    let getBalanceResp = await ctx.pchain.getBalance(ctx.pAddressBech32!);
    let unlocked = new BN(getBalanceResp.unlocked);
    let pChainUTXOResp = await ctx.pchain.getUTXOs(ctx.pAddressBech32!);
    let utxoSet = pChainUTXOResp.utxos;

    let unsignedTx = await ctx.pchain.buildExportTx(
        utxoSet,
        unlocked.sub(fee),
        ctx.cChainBlockchainID,
        [cchainPubKeyBech32],
        [ctx.pAddressBech32!],
        [ctx.pAddressBech32!],
        memo,
        UnixNow(),
        lockTime,
        signerThreshold
    );

    return unsignedTx;

}

// Create a transaction to import an export from p-chain (i.e. exported on p-chain now import on c-chain)
// cchainUTXOSet is the set of UTXOs that we want to import on c-chain that we exported from p-chain
// Here also we have the duplicate run required - see build_c2p_export_tx
async function build_p2c_import_tx(cchainUTXOSet, badFeeTx = undefined){
    let baseFeeResponse = await cchain.getBaseFee();
    let baseFee = new BN(parseInt(baseFeeResponse, 16) / 1e9);
    let fee = baseFee;
    let unsignedTx;

    if(badFeeTx !== undefined){
        let importCost = costImportTx(badFeeTx);
        fee = baseFee.mul(new BN(importCost));

    }

    unsignedTx = await cchain.buildImportTx(
        cchainUTXOSet,
        '0x' + cchainPubKeyClear,
        [cchainPubKeyBech32],
        PChainBlockchainId,
        [cchainPubKeyBech32],
        fee
    );

    return unsignedTx;

}

// Create an actual staking transaction on p-chain.
// parameters should be sufficient, lockduration is the time for which the stake is locked.
async function build_delegate_tx(avaxAmount, lockDuration, nodeId){
    let minStakeAmount = await ctx.pchain.getMinStake();
    let avaxAssetId = await ctx.pchain.getAVAXAssetID();
    let allBalances = await ctx.pchain.getBalance(ctx.pAddressBech32!);
    let unlocked = new BN(allBalances.unlocked);
    let fee = await ctx.pchain.getDefaultTxFee();
    let locktime = new BN(0);
    let threshold = 1;
    let bintools = BinTools.getInstance();


    let outputs = [];
    let inputs = [];
    let stakeOutputs = [];

    // TODO - Check if fee is impacted from size of TX
    // TODO: Check for minimal amount match.

    // Construct output of for the delegator tx
    let returnToSenderOutputSECP = new SECPTransferOutput(
        unlocked.sub(fee).sub(new BN(avaxAmount * 1e9)),
        [bintools.stringToAddress(ctx.pAddressBech32!)],
        locktime,
        threshold
    );
    let returnToSenderOutput = new TransferableOutput(
        avaxAssetId,
        returnToSenderOutputSECP
    );
    outputs.push(returnToSenderOutput);

    // Construct output for staker (to pay for delegation).
    let sendToStakerSECP = new SECPTransferOutput(
        new BN(avaxAmount * 1e9),
        [bintools.stringToAddress(ctx.pAddressBech32!)],
        locktime,
        threshold
    );

    let sendToStaker = new TransferableOutput(
        avaxAssetId,
        sendToStakerSECP
    );
    stakeOutputs.push(sendToStaker);

    // Construct the rewards output (to get the rewards assuming applicable).
    let rewardsOwnerSECP = new SECPOwnerOutput(
        [bintools.stringToAddress(ctx.pAddressBech32!)],
        locktime,
        threshold
    );
    let rewardsOwner = new ParseableOutput(rewardsOwnerSECP);

    // Prepare UTXOs for signature
    let utxoResponse = await ctx.pchain.getUTXOs([ctx.pAddressBech32!]);
    let utxoSet = utxoResponse.utxos;
    let utxos = utxoSet.getAllUTXOs();

    utxos.forEach((utxo) => {
        let output = utxo.getOutput();
        if(output.getOutputID() === 7){ // Can be used.
            const amountOutput = utxo.getOutput();
            let amt = amountOutput.getAmount().clone();
            let txId = utxo.getTxID()
            let outputIdx = utxo.getOutputIdx();

            let secpTransferInput = new SECPTransferInput(amt);
            secpTransferInput.addSignatureIdx(0, ctx.pAddressBech32!);

            let input = new TransferableInput(
                txId,
                outputIdx,
                avaxAssetId,
                secpTransferInput
            );

            inputs.push(input);
        }
    });


    let startTime = UnixNow().add(new BN(60 * 1));
    let endTime = startTime.clone().add(new BN(lockDuration));

    let addDelegatorTx = new AddDelegatorTx(
        chainId,
        bintools.cb58Decode(PChainBlockchainId),
        outputs,
        inputs,
        Buffer.from(''),
        NodeIDStringToBuffer(nodeId),
        startTime,
        endTime,
        new BN(avaxAmount * 1e9),
        stakeOutputs,
        rewardsOwner
    );

    return new pUnsignedTx(addDelegatorTx);

}

(async () => {

    // =========== Compute addresses for C chain and P chain
    account = await fbks.getVaultAccounts({ namePrefix: 'Test', nameSuffix: ""});
    account = account[0];
    let pubKeyData = await fbks.getPublicKeyInfoForVaultAccount({
        assetId: assetId,
        compressed: false,
        change: 0,
        addressIndex: 0,
        vaultAccountId: account.id
    });
    let pubkey = pubKeyData.publicKey.substring(2);

    let digest = keccak256(Buffer.from(pubkey, "hex"));
    cchainPubKeyClear = digest.slice(-40);

    pubKeyData = await fbks.getPublicKeyInfoForVaultAccount({
        assetId: assetId,
        compressed: true,
        change: 0,
        addressIndex: 0,
        vaultAccountId: account.id
    });

    pubkey = pubKeyData.publicKey;
    let midHash = sha256.sha256.create().update(Buffer.from(pubkey, 'hex')).digest();
    let finalHash = await ripemd160(Buffer.from(midHash));
    pchainPubKeyClear = Buffer.from(finalHash).toString('hex');
    ctx.pAddressBech32! = 'P-' + bech32.encode('fuji', bech32.toWords(Buffer.from(pchainPubKeyClear, 'hex')));
    cchainPubKeyBech32 = 'C-' + bech32.encode('fuji', bech32.toWords(Buffer.from(pchainPubKeyClear,'hex')));
    console.log(`P-Chain and X-Chain address ${ctx.pAddressBech32!} \\ ${pchainPubKeyClear} , C-Chain is ${cchainPubKeyBech32} \\ ${cchainPubKeyClear}`);

    // =========== Misc code for getting balance and staking details - incomplete
    // let a  = await ctx.pchain.getStake([ctx.pAddressBech32!], 'hex');
    // console.log(util.inspect(a));

    // let b = await ctx.pchain.getRewardUTXOs('2bdybSG7axkzimszvxJ6YDSLZawMQ4WWZ6SvPrbV8qNQRpyYKL', 'hex');
    // console.log(util.inspect(b));

    // let c = await ctx.pchain.getBalance(ctx.pAddressBech32!);
    // console.log(util.inspect(c));

    // let d = await ctx.pchain.getCurrentValidators(PChainBlockchainId, ['NodeID-4B4rc5vdD1758JSBYL1xyvE5NHGzz6xzH']);
    // console.log(util.inspect(d));

    // ============= (1) EXPORT ON CCHAIN
    // let unsignedTx = await build_c2p_export_tx();
    // console.log("Built unsigned Tx.");
    // unsignedTx = await build_c2p_export_tx(unsignedTx);
    // console.log(`Built unsigned Tx with correct fee.`);
    // let signedTx = await signTx(unsignedTx, false);
    // let avaxTxId = await cchain.issueTx(signedTx);
    // console.log(`Done: ${avaxTxId}`);


    // ============= (2) IMPORT ON ctx.pchain
    // let pchainUTXOsResp = await ctx.pchain.getUTXOs([ctx.pAddressBech32!], ctx.cChainBlockchainID);
    // let utxos = pchainUTXOsResp.utxos;
    // let unsignedTx = await build_c2p_import_tx(utxos);
    // console.log(`${util.inspect(unsignedTx, false, null, true)}`);
    // console.log("Built unsigned import Tx.");
    // let signedTx = await signTx(unsignedTx, false, true);
    // console.log(`${util.inspect(signedTx, false, null, true)}`);
    // let pchainTxId = await ctx.pchain.issueTx(signedTx);
    // console.log(`Tx Id: ${pchainTxId}`);

    // ============= (3) DELEGATE ON ctx.pchain
    //NodeID-LQwRLm4cbJ7T2kxcxp4uXCU5XD8DFrE1C - Sent 1 on Tue Aug2
    //NodeID-4B4rc5vdD1758JSBYL1xyvE5NHGzz6xzH - Sent 1 on Tue Aug2
    //NodeID-LQwRLm4cbJ7T2kxcxp4uXCU5XD8DFrE1C - Sent 1 on Wed Aug3
    // let unsignedTx = await build_delegate_tx(1/*AVAX*/, 14*24*60*60/*2 Weeks in seconds*/,'NodeID-LQwRLm4cbJ7T2kxcxp4uXCU5XD8DFrE1C'/*NodeID*/);
    // console.log('Built delegate TX');
    // let signedTx = await signTx(unsignedTx, true, false);
    // console.log('Signed');
    // let txId = await ctx.pchain.issueTx(signedTx);
    // console.log(`Tx Id: ${txId}`);


    // ============= (4) EXPORT ON ctx.pchain
    // let pchainUTXOsResp = await ctx.pchain.getUTXOs([ctx.pAddressBech32!]);
    // let utxos = pchainUTXOsResp.utxos;
    // let unsignedTx = await build_p2c_export_tx(/*utxos*/);
    // let signedTx = await signTx(unsignedTx, false, true);
    // let pchainTxId = await ctx.pchain.issueTx(signedTx);
    // console.log(`Tx Id: ${pchainTxId}`);

    // ============= EXPORT ON CCHAIN
    // let cchainUTXOsResp = await cchain.getUTXOs([cchainPubKeyBech32], PChainBlockchainId);
    // let cchainUTXOSet = cchainUTXOsResp.utxos;
    // let unsignedTx = await build_p2c_import_tx(cchainUTXOSet);
    // console.log(`Built bad fee Tx.`);
    // unsignedTx = await build_p2c_import_tx(cchainUTXOSet, unsignedTx);
    // console.log(`Built good fee Tx.`);

    // let signedTx = await signTx(unsignedTx, false, false);
    // let txId = await cchain.issueTx(signedTx);
    // console.log(`Tx Id: ${txId}`);


})();
