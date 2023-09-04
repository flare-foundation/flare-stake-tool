const fixtaures = {
  ledgerSign: {
    mock: {
      hash: 'mockedMessageHash',
      message: 'mockedMessage',
      mockedUnsignedTxBuffer: 'mockedUnsignedTxBuffer',
      publicKey:
        '04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190',
      address: '0xfa32C77AA014584bB9c3F69d8D1d74B8844e1A92',
      path: "m/44'/9000'/0'/0/0"
    }
  },
  sign: {
    mock: {
      valid: {
        jsonContent: {
          transactionType: 'dummyTransactionType',
          serialization: 'dummySerialisation',
          signatureRequests: [
            { message: 'dummyrequest1', signer: 'signer1' },
            { message: 'dummyrequest2', signer: 'signer2' }
          ],
          unsignedTransactionBuffer: 'dummybuffer'
        },
        signature: 'dummySignature',
        path: "m/44'/9000'/0'/0/0",
        file: 'validUnsignedTx.signed.json'
      },
      invalid: {
        jsonContent: {
          transactionType: 'dummyTransactionType',
          serialization: 'dummySerialisation',
          signatureRequests: [],
          unsignedTransactionBuffer: 'dummybuffer'
        }
      }
    }
  }
};

export default fixtaures;
