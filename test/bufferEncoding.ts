import { UnsignedTx as UnsignedTxEvm } from "@flarenetwork/flarejs/dist/apis/evm";
import { Buffer as FlrBuffer } from '@flarenetwork/flarejs'
const { readFileSync } = require("fs");
import { SignedTxJson, UnsignedTxJson } from '../src/interfaces'
import { contextFile, Context } from "../src/constants";

import { readUnsignedTxJson, readSignedTxJson } from "../src/utils";
import { issueSignedEvmTx as issueSignedEvmTx } from "../src/evmAtomicTx";

import { Tx } from "@flarenetwork/flarejs/dist/apis/evm";

function decodeSignedTxjson(ctx: Context, signedTxJson: SignedTxJson): Tx {
    const buffer = FlrBuffer.from(signedTxJson.unsignedTransactionBuffer, "hex")
    const unsignedTx = new UnsignedTxEvm();
    unsignedTx.fromBuffer(buffer);
    const signatures = Array(signedTxJson.signatureRequests.length).fill(signedTxJson.signature)
    return unsignedTx.signWithRawSignatures(signatures, ctx.cKeychain)
}

async function sendSignedTx(id: string) {
    const context = contextFile("ctx.json")
    const signedTxJson = readSignedTxJson(id)
    const signedTx = decodeSignedTxjson(context, signedTxJson)
    const chainTxId = await context.cchain.issueTx(signedTx)
    console.log(chainTxId)
}

//sendSignedTx("1")