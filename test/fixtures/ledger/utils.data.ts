const fixtures = {
    privateKeyToPublicKeyEncoding: {
        privateKey: "88b3cf6b7e9ef18a508209d61311a376bde77be5d069449b1eace71130f8252c",
        publicKeyEncoding: "02423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded"
    },
    standardizePublicKey: {
        publicKey: "04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190",
        standardizedPublicKey: "02423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded"
    },
    recoverTransactionPublicKey: {
        privateKey: Buffer.from("88b3cf6b7e9ef18a508209d61311a376bde77be5d069449b1eace71130f8252c", "hex"),
        message:"Example `personal_sign` message",
        signature: "0xa39eb1f21ca7f8038d07881e7b95c767b4bddd336e495b9bec77ebfb87ca888a1d085088ab11fbcde50f411ed6aa60c012c5aae851dc3fbcb158fb8848d9a7951b"
    }
}

export default fixtures