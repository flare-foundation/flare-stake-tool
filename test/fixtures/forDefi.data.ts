const fixtures = {
  getVaultPublickey: {
    mock: {
      vaultId: 'vault123',
      accessToken: 'mockAccessToken',
      publicKeyBase64: '033882e4a5a050475cdaf0378d30d8c88525960ac80b303d24c8f5a57d13a7ce37'
    },
    output:
      'd37dfcf367b86b96b4e74e3be5c75a7f4dfbf1ddf477c73cf39db9f7ad1a73cd1bdf4ddddb873c7f96b9eddd776bb71edf'
  },
  getSignature: {
    mock: {
      responseSignatureData: 'dummySignature',
      forDefiTxId: 'dummyId',
      accesstoken: 'dummmyaccesstoken',
      unsignedTxidFile: 'dummyfileid',
      unsignedtrx: {
        txidObj: {
          transactionType: 'exportCP',
          serialization: `[\n \"8e1bcc131f2640\",\n \"fxMAKpBQQpFedrUhWMsDYfCUJxdUw4mneTczKBzNg3rc2JUub\",\n \"11111111111111111111111111111111LpoYY\",\n \"0x01945cedbb2d43a488bb15af34dd2dd07e7a9330\",\n
            \"C-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt\",\n [\n \"P-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt\"\n ],\n 2,\n \"00\",\n 1,\n \"3b9aca00\"\n]`,
          signatureRequests: [
            {
              message: 'd7c3239ac7456ca05cbdaa349ac9b56b643adf7ff1784b079b83d2af82c49e7a',
              signer: '8a364db6c188db1303c4b70621280a4d724f742d'
            }
          ],
          unsignedTransactionBuffer:
            '0000000000010000007278db5c30bed04c05ce209179812850bbb3fe6d46d7eef3744d814c0da555247900000000000000000000000000000000000000000000000000000000000000000000000101945cedbb2d43a488bb15af34dd2dd07e7a9330008e1bcc4eb9f04058734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000000000000020000000158734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000007008e1bcc131f2640000000000000000000000001000000018a364db6c188db1303c4b70621280a4d724f742d',
          usedFee: '1000000000',
          forDefiHash: '18MjmsdFbKBcvao0msm1a2Q633/xeEsHm4PSr4LEnno='
        }
      },
      unsignedWithdrawlTrx: {
        txidObj: {
          rawTx: {
            nonce: 1,
            gasPrice: 500000000000,
            gasLimit: 8000000,
            to: '0x3AF4d285506B6d4214c21415A6803cd6F8077f35',
            value: '300000000000000000000',
            chainId: 114
          },
          message: 'f33c6a86cbf25dd7726e8c88f61b39663e35e5e7c5f5fa8a124c28597f67f65c',
          forDefiHash: '8zxqhsvyXddyboyI9hs5Zj415efF9fqKEkwoWX9n9lw=',
          forDefiTxId: '5ac078ee-a549-474d-8f93-983177949764'
        }
      }
    },
    output: '76e9a6c928a09dab6ead'
  },
  sendToForDefi: {
    input: {
      unsignedTxidFile: 'unsignedTxidFile',
      ctxFile: 'ctx.json'
    },
    mock: {
      accessToken: 'mockaccesstoken',
      vaultId: 'mockvault',
      vaultPublicKey:
        '04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190',
      publicKey:
        '04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190',
      unsignedtrx: {
        txidObj: {
          transactionType: 'exportCP',
          serialization: `[\n \"8e1bcc131f2640\",\n \"fxMAKpBQQpFedrUhWMsDYfCUJxdUw4mneTczKBzNg3rc2JUub\",\n \"11111111111111111111111111111111LpoYY\",\n \"0x01945cedbb2d43a488bb15af34dd2dd07e7a9330\",\n
                \"C-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt\",\n [\n \"P-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt\"\n ],\n 2,\n \"00\",\n 1,\n \"3b9aca00\"\n]`,
          signatureRequests: [
            {
              message: 'd7c3239ac7456ca05cbdaa349ac9b56b643adf7ff1784b079b83d2af82c49e7a',
              signer: '8a364db6c188db1303c4b70621280a4d724f742d'
            }
          ],
          unsignedTransactionBuffer:
            '0000000000010000007278db5c30bed04c05ce209179812850bbb3fe6d46d7eef3744d814c0da555247900000000000000000000000000000000000000000000000000000000000000000000000101945cedbb2d43a488bb15af34dd2dd07e7a9330008e1bcc4eb9f04058734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000000000000020000000158734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000007008e1bcc131f2640000000000000000000000001000000018a364db6c188db1303c4b70621280a4d724f742d',
          usedFee: '1000000000',
          forDefiHash: '18MjmsdFbKBcvao0msm1a2Q633/xeEsHm4PSr4LEnno='
        }
      },
      unsignedWithdrawlTrx: {
        txidObj: {
          rawTx: {
            nonce: 1,
            gasPrice: 500000000000,
            gasLimit: 8000000,
            to: '0x3AF4d285506B6d4214c21415A6803cd6F8077f35',
            value: '300000000000000000000',
            chainId: 114
          },
          message: 'f33c6a86cbf25dd7726e8c88f61b39663e35e5e7c5f5fa8a124c28597f67f65c',
          forDefiHash: '8zxqhsvyXddyboyI9hs5Zj415efF9fqKEkwoWX9n9lw=',
          forDefiTxId: '5ac078ee-a549-474d-8f93-983177949764'
        }
      },
      secretPem: `mockPrivateKey`,
      txId: 'dummytxid',
      signature1: "mockSignature1"
    }
  }
};

export default fixtures;
