const fixtures = {
    contextFromOptions: {
        input: {
            env: {
                envPath: ".env",
                network: "localflare"
            },
            ctx: {
                ctxFile: "ctx.json"
            }
        },
        mock: {
            ledger: {
                publickey: "04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190"
            }
        }
    },
    networkFromOptions: {
        flare: {input:{network: "flare"}, output: "flare"},
        null: {input: {network: null}, output: "flare"}
    },
    logAddressInfo: {
        network: "localflare",
        pchainAddress: "P-localflare13dyerwvff59zeazeqejsfs0skadkvsj6x79tqt",
        cchainAddress: "0xfa32c77aa014584bb9c3f69d8d1d74b8844e1a92",
        secp256k1PublicKey: "0x02423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded"
    }
}

export default fixtures