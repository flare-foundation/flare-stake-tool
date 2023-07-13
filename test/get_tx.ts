import { contextEnv } from '../src/constants'
import { ExportTx } from '@flarenetwork/flarejs/dist/apis/evm'

const a = `{"jsonrpc":"2.0","result":{"tx":"0x0000000000010000007278db5c30bed04c05ce209179812850bbb3fe6d46d7eef3744d814c0da555247900000000000000000000000000000000000000000000000000000000000000000000000174a762bd2d7e1c4037b016e0acaf4d693d9661be000000003bae54ee58734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000000000000000000000158734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000007000000003baa0c4000000000000000000000000100000001b0e224c793d378c2deca87b57f1c8d4e4c136ffc000000010000000900000001dbe4907e4df17dec1c9c0d6bef9f87a68dc0cd06c6199d07b2680a5be5daec2b57678b649b1c5be00997c49b8fdb03fcd5dab91db42dfe65d9eed474f31411cd0043ce7e63","encoding":"hex","blockHeight":"4746851"},"id":1}`

async function main() {
    const context = contextEnv("./.env", 'localflare')
    const ptx = await context.pchain.getTx("2wWkEryBkRUUKvqWMZGxoJPHRQhUEXfRwmN2dFDjHhpXQ71SCL", "json")
    const ctx = await context.cchain.getAtomicTx("2Q3jZfMDHPb1v5cSpMvJt97iSFhNFWdb876nHmKquivz9FXaaF")
    const exportx = new ExportTx()
    exportx.deserialize(JSON.parse(a).result.tx, 'hex')
}

main()