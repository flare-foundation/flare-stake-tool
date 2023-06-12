import * as util from 'ethereumjs-util';

const message = "e89a173dabdea82e7ba2343553026fae87ac80d89016d618f64ce224a95af9ad"
const signedTx = "0xf385087e5519549790976f1d59bc7398116ef1179c852316bd97eb0467ab046d45b679e5e33275bb9ab51d680163784bfd9fa0508dfed13ad0bd653f5ddcbfdc1c"

function recoverSigner(message: Buffer, signature: string) {
    const messageHash = util.hashPersonalMessage(message)
    let split = util.fromRpcSig(signature);
    let publicKey = util.ecrecover(messageHash, split.v, split.r, split.s);
    let signer = util.pubToAddress(publicKey).toString("hex");
    return signer;
}

console.log(recoverSigner(Buffer.from(message, 'hex'), signedTx))

/* const r = "4337863193ae979a39a9f81ef35a8e47d07d0c2f043969c330c8dfe43d631040"
const v = "1b"
// @ts-ignore
const publicKeyIsEven = (v == '1b')
const [x, y] = decodePublicKey((publicKeyIsEven ? '0x02' : '0x03') + r)
const ethAddress = util.keccak(Buffer.concat([x, y])).slice(-20).toString('hex')

console.log(ethAddress) */