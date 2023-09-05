import { BN } from '@flarenetwork/flarejs/dist';
const fixtures = {
  privateKeyToEncodedPublicKey: {
    input: 'abcd',

    output: {
      COMPRESSED_PUBLIC_KEY: '033882e4a5a050475cdaf0378d30d8c88525960ac80b303d24c8f5a57d13a7ce37',
      UNCOMPRESSED_PUBLIC_KEY:
        '043882e4a5a050475cdaf0378d30d8c88525960ac80b303d24c8f5a57d13a7ce374e76373065fbc1a7d17e76064a4b4b35ce95e6c7c643ee62d1743a5e217277cb'
    }
  },
  privateKeyToPublicKey: {
    input: 'abcd',
    output: [
      Buffer.from([
        0xcb, 0x15, 0x41, 0xbb, 0xbc, 0x4f, 0x51, 0x9b, 0x98, 0xec, 0x8c, 0x95, 0xa6, 0x8d, 0x4f,
        0xb2, 0xe2, 0x14, 0x22, 0x4e, 0x0e, 0x96, 0xe6, 0x8f, 0x4e, 0x1a, 0x16, 0x12, 0x61, 0xc1,
        0x13, 0x81
      ]),
      Buffer.from([
        0x50, 0x55, 0x03, 0x96, 0x22, 0xdf, 0x26, 0x13, 0xc2, 0x11, 0xa2, 0xa7, 0x47, 0xa0, 0xd7,
        0x09, 0x88, 0x40, 0x3c, 0xab, 0xe2, 0x01, 0x4c, 0x92, 0x40, 0x89, 0x5a, 0xb7, 0x16, 0xd8,
        0xe6, 0xe5
      ])
    ]
  },
  decodePublicKey: {
    input:
      '0x04a1e369c066e2491124ce3e1292355583d4ada12f8dce10621568a5e27306d0c226e756a0549f2225be86a35ae84939d7efe39cfb1945a11d9af784fd2fbc14a3',
    output: [
      Buffer.from([
        0xa1, 0xe3, 0x69, 0xc0, 0x66, 0xe2, 0x49, 0x11, 0x24, 0xce, 0x3e, 0x12, 0x92, 0x35, 0x55,
        0x83, 0xd4, 0xad, 0xa1, 0x2f, 0x8d, 0xce, 0x10, 0x62, 0x15, 0x68, 0xa5, 0xe2, 0x73, 0x06,
        0xd0, 0xc2
      ]),
      Buffer.from([
        0x26, 0xe7, 0x56, 0xa0, 0x54, 0x9f, 0x22, 0x25, 0xbe, 0x86, 0xa3, 0x5a, 0xe8, 0x49, 0x39,
        0xd7, 0xef, 0xe3, 0x9c, 0xfb, 0x19, 0x45, 0xa1, 0x1d, 0x9a, 0xf7, 0x84, 0xfd, 0x2f, 0xbc,
        0x14, 0xa3
      ])
    ]
  },
  compressPublicKey: {
    input: {
      x: Buffer.from([
        0xa1, 0xe3, 0x69, 0xc0, 0x66, 0xe2, 0x49, 0x11, 0x24, 0xce, 0x3e, 0x12, 0x92, 0x35, 0x55,
        0x83, 0xd4, 0xad, 0xa1, 0x2f, 0x8d, 0xce, 0x10, 0x62, 0x15, 0x68, 0xa5, 0xe2, 0x73, 0x06,
        0xd0, 0xc2
      ]),
      y: Buffer.from([
        0x26, 0xe7, 0x56, 0xa0, 0x54, 0x9f, 0x22, 0x25, 0xbe, 0x86, 0xa3, 0x5a, 0xe8, 0x49, 0x39,
        0xd7, 0xef, 0xe3, 0x9c, 0xfb, 0x19, 0x45, 0xa1, 0x1d, 0x9a, 0xf7, 0x84, 0xfd, 0x2f, 0xbc,
        0x14, 0xa3
      ])
    },
    output: Buffer.from([
      0x03, 0xa1, 0xe3, 0x69, 0xc0, 0x66, 0xe2, 0x49, 0x11, 0x24, 0xce, 0x3e, 0x12, 0x92, 0x35,
      0x55, 0x83, 0xd4, 0xad, 0xa1, 0x2f, 0x8d, 0xce, 0x10, 0x62, 0x15, 0x68, 0xa5, 0xe2, 0x73,
      0x06, 0xd0, 0xc2
    ])
  },
  publicKeyToBech32AddressBuffer: {
    input: {
      x: Buffer.from([
        0xa1, 0xe3, 0x69, 0xc0, 0x66, 0xe2, 0x49, 0x11, 0x24, 0xce, 0x3e, 0x12, 0x92, 0x35, 0x55,
        0x83, 0xd4, 0xad, 0xa1, 0x2f, 0x8d, 0xce, 0x10, 0x62, 0x15, 0x68, 0xa5, 0xe2, 0x73, 0x06,
        0xd0, 0xc2
      ]),
      y: Buffer.from([
        0x26, 0xe7, 0x56, 0xa0, 0x54, 0x9f, 0x22, 0x25, 0xbe, 0x86, 0xa3, 0x5a, 0xe8, 0x49, 0x39,
        0xd7, 0xef, 0xe3, 0x9c, 0xfb, 0x19, 0x45, 0xa1, 0x1d, 0x9a, 0xf7, 0x84, 0xfd, 0x2f, 0xbc,
        0x14, 0xa3
      ])
    },
    output: Buffer.from([
      0x96, 0x7d, 0x1c, 0x23, 0xee, 0xa7, 0xd6, 0xf6, 0xae, 0x55, 0x65, 0x54, 0xd8, 0xc5, 0x85,
      0x70, 0x68, 0xf9, 0x2a, 0x3c
    ])
  },
  publicKeyToBech32AddressString: {
    input:
      '0x04a1e369c066e2491124ce3e1292355583d4ada12f8dce10621568a5e27306d0c226e756a0549f2225be86a35ae84939d7efe39cfb1945a11d9af784fd2fbc14a3',
    output: 'abcd1je73cglw5lt0dtj4v42d33v9wp50j23usrvpxq'
  },
  publicKeyToEthereumAddressString: {
    input:
      '0x04a1e369c066e2491124ce3e1292355583d4ada12f8dce10621568a5e27306d0c226e756a0549f2225be86a35ae84939d7efe39cfb1945a11d9af784fd2fbc14a3',
    output: '0x69e666767ba3a661369e1e2f572ede7adc926029'
  },
  validatePublicKey: {
    input:
      '0x04a1e369c066e2491124ce3e1292355583d4ada12f8dce10621568a5e27306d0c226e756a0549f2225be86a35ae84939d7efe39cfb1945a11d9af784fd2fbc14a3',
    output: true
  },
  recoverTransactionSigner: {
    input: {
      message: Buffer.from([
        0xaf, 0x1d, 0xee, 0x89, 0x47, 0x86, 0xc3, 0x04, 0x60, 0x4a, 0x03, 0x9b, 0x04, 0x14, 0x63,
        0xc9, 0xab, 0x8d, 0xef, 0xb3, 0x93, 0x40, 0x3e, 0xa0, 0x3c, 0xf2, 0xc8, 0x5b, 0x1e, 0xb8,
        0xcb, 0xfd
      ]),
      signature:
        '0xe2b47e849f20c9fa46d3c0df5b5c846631a978835b17a2b370d348a5560c1734623807c9e9ca9775fd263a4e7caccae8fed655622eb761df949d6740d9600d651b'
    },
    output: '69e666767ba3a661369e1e2f572ede7adc926029'
  },
  recoverMessageSigner: {
    input: {
      message: 'Example `personal_sign` message',
      signature:
        '0xe2b47e849f20c9fa46d3c0df5b5c846631a978835b17a2b370d348a5560c1734623807c9e9ca9775fd263a4e7caccae8fed655622eb761df949d6740d9600d651b'
    },
    output: '69e666767ba3a661369e1e2f572ede7adc926029'
  },
  recoverPublicKey: {
    input: {
      message: Buffer.from([
        0xaf, 0x1d, 0xee, 0x89, 0x47, 0x86, 0xc3, 0x04, 0x60, 0x4a, 0x03, 0x9b, 0x04, 0x14, 0x63,
        0xc9, 0xab, 0x8d, 0xef, 0xb3, 0x93, 0x40, 0x3e, 0xa0, 0x3c, 0xf2, 0xc8, 0x5b, 0x1e, 0xb8,
        0xcb, 0xfd
      ]),
      signature:
        '0xe2b47e849f20c9fa46d3c0df5b5c846631a978835b17a2b370d348a5560c1734623807c9e9ca9775fd263a4e7caccae8fed655622eb761df949d6740d9600d651b'
    },
    output: [
      161, 227, 105, 192, 102, 226, 73, 17, 36, 206, 62, 18, 146, 53, 85, 131, 212, 173, 161, 47,
      141, 206, 16, 98, 21, 104, 165, 226, 115, 6, 208, 194, 38, 231, 86, 160, 84, 159, 34, 37, 190,
      134, 163, 90, 232, 73, 57, 215, 239, 227, 156, 251, 25, 69, 161, 29, 154, 247, 132, 253, 47,
      188, 20, 163
    ]
  },
  expandSignature: {
    validInput: {
      input:
        '8f22d5422bb57f9fd547657034fa1ccf34d635a59b41b02fcaab9098d06d6a2d04123c2b033919df7701a3ea959673db918eae9ce20701c8d8798a74b8987e741b',
      output: {
        r: '64742282003540997734007260697719408867668808008424064524132334535794324498989',
        s: '1841469905897017483840874083154324748176232596721032359187948091369139502708',
        recoveryParam: 0
      }
    },
    nullInput: {
      input: '',
      output: {
        r: '0',
        s: '0',
        recoveryParam: NaN
      }
    }
  },
  sleepms: {
    input: 1000
  },
  getUserInput: {
    input: 'Testing Input',
    output: 'Testing output'
  },
  unPrefix0x: {
    inputWith0xPrefix: {
      input: '0xabcd',
      output: 'abcd'
    },
    inputWithOut0xPrefix: {
      input: 'abcd',
      output: 'abcd'
    },
    nullInput: {
      input: '',
      output: '0x0'
    }
  },
  prefix0x: {
    inputWith0xPrefix: {
      input: '0xabcd',
      output: '0xabcd'
    },
    inputWithOut0xPrefix: {
      input: 'abcd',
      output: '0xabcd'
    },
    nullInput: {
      input: '',
      output: '0x0'
    }
  },
  decimalToInteger: {
    decimalNumber: {
      input: { dec: '123.456789', offset: 3 },
      output: '123456'
    },
    wholeNumber: {
      input: { dec: '789', offset: 4 },
      output: '7890000'
    },
    largeOffset: {
      input: { dec: '999.999', offset: 6 },
      output: '999999000'
    },
    smallOffset: {
      input: { dec: '543.2123', offset: 2 },
      output: '54321'
    },
    negativeoffset: {
      input: { dec: '999.999', offset: -6 },
      output: '999'
    }
  },
  integerToDecimal: {
    wholeNumber: {
      input: { int: '123456', offset: 4 },
      output: '12.3456'
    },
    largeOffset: {
      input: { int: '789', offset: 6 },
      output: '.000789'
    },
    smallOffset: {
      input: { int: '54321', offset: 2 },
      output: '543.21'
    },
    negativeoffset: {
      input: { int: '999999', offset: -6 },
      output: '999999.'
    }
  },
  toBN: {
    positiveNumber: {
      input: 123,
      output: new BN(123)
    },
    negativeNumber: {
      input: -123,
      output: new BN(-123)
    },
    numberString: {
      input: '123',
      output: new BN('123')
    },
    bigNumber: {
      input: new BN(123),
      output: new BN(123)
    },
    undefinedInput: {
      input: undefined,
      output: undefined
    }
  },
  serializeExportCP_args: {
    allValues: {
      input: [
        new BN(123),
        'value1',
        'value2',
        'value3',
        'value4',
        ['item1', 'item2'],
        42,
        new BN(456),
        7,
        new BN(789)
      ],
      output: JSON.stringify(
        [
          new BN(123),
          'value1',
          'value2',
          'value3',
          'value4',
          ['item1', 'item2'],
          42,
          new BN(456),
          7,
          new BN(789)
        ],
        null,
        2
      )
    },
    zeroValues: {
      input: [new BN(0), '', '', '', '', [], 0, new BN(0), 0, undefined],
      output: JSON.stringify([new BN(0), '', '', '', '', [], 0, new BN(0), 0, undefined], null, 2)
    }
  },
  deserializeExportCP_args: {
    allValues: {
      input: '["123","value1","value2","value3","value4",["item1","item2"],42,"456",7,"789"]',
      output: [
        new BN('291'),
        'value1',
        'value2',
        'value3',
        'value4',
        ['item1', 'item2'],
        42,
        new BN('1110'),
        7,
        new BN('1929')
      ]
    },
    zeroValues: {
      input: '["0","","","","",[],0,"0",0,""]',
      output: [new BN('0', 16), '', '', '', '', [], 0, new BN('0', 16), 0, '0']
    }
  },
  saveUnsignedTxJson: {
    input: {
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
  readUnsignedTxJson: {
    input: 'uniqueId123',
    output: {
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
  readSignedTxJson: {
    valid: {
      input: 'uniqueId123',
      output: {
        transactionType: 'exportCP',
        serialization:
          '[\n  "8e1bcc131f2640",\n  "fxMAKpBQQpFedrUhWMsDYfCUJxdUw4mneTczKBzNg3rc2JUub",\n  "11111111111111111111111111111111LpoYY",\n  "0x01945cedbb2d43a488bb15af34dd2dd07e7a9330",\n  "C-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt",\n  [\n    "P-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt"\n  ],\n  2,\n  "00",\n  1,\n  "3b9aca00"\n]',
        signatureRequests: [
          {
            message: 'd7c3239ac7456ca05cbdaa349ac9b56b643adf7ff1784b079b83d2af82c49e7a',
            signer: '8a364db6c188db1303c4b70621280a4d724f742d'
          }
        ],
        unsignedTransactionBuffer:
          '0000000000010000007278db5c30bed04c05ce209179812850bbb3fe6d46d7eef3744d814c0da555247900000000000000000000000000000000000000000000000000000000000000000000000101945cedbb2d43a488bb15af34dd2dd07e7a9330008e1bcc4eb9f04058734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000000000000020000000158734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000007008e1bcc131f2640000000000000000000000001000000018a364db6c188db1303c4b70621280a4d724f742d',
        usedFee: '1000000000',
        forDefiHash: '18MjmsdFbKBcvao0msm1a2Q633/xeEsHm4PSr4LEnno=',
        forDefiTxId: 'ff335dfa-e58f-4b2e-91da-12134c8c3a0d',
        signature:
          '1117279d3c37efb5da376ff4d3139067429767e0c32839df63253468a55bb6691f634ebae45081d0e8cb212d0b24ea1cd5b36d29418dfa3b6aee4d3344aa76b001'
      }
    },
    invalid: {
      input: 'uniqueId123',
      //invalid output
      output: {
        transactionType: 'exportCP',
        serialization:
          '[\n  "8e1bcc131f2640",\n  "fxMAKpBQQpFedrUhWMsDYfCUJxdUw4mneTczKBzNg3rc2JUub",\n  "11111111111111111111111111111111LpoYY",\n  "0x01945cedbb2d43a488bb15af34dd2dd07e7a9330",\n  "C-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt",\n  [\n    "P-costwo13gmymdkp3rd3xq7ykurzz2q2f4ey7apd88p0jt"\n  ],\n  2,\n  "00",\n  1,\n  "3b9aca00"\n]',
        signatureRequests: [
          {
            message: 'd7c3239ac7456ca05cbdaa349ac9b56b643adf7ff1784b079b83d2af82c49e7a',
            signer: '8a364db6c188db1303c4b70621280a4d724f742d'
          }
        ],
        unsignedTransactionBuffer:
          '0000000000010000007278db5c30bed04c05ce209179812850bbb3fe6d46d7eef3744d814c0da555247900000000000000000000000000000000000000000000000000000000000000000000000101945cedbb2d43a488bb15af34dd2dd07e7a9330008e1bcc4eb9f04058734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000000000000020000000158734f94af871c3d131b56131b6fb7a0291eacadd261e69dfb42a9cdf6f7fddd00000007008e1bcc131f2640000000000000000000000001000000018a364db6c188db1303c4b70621280a4d724f742d',
        usedFee: '1000000000',
        forDefiHash: '18MjmsdFbKBcvao0msm1a2Q633/xeEsHm4PSr4LEnno=',
        forDefiTxId: 'ff335dfa-e58f-4b2e-91da-12134c8c3a0d'
      }
    }
  },
  saveUnsignedWithdrawalTx: {
    input: {
      id: 'uniqueId123',
      unsignedTx: {
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
    output: {}
  },
  readUnsignedWithdrawalTx: {
    input: 'uniqueId123',
    output: {
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
  readSignedWithdrawalTx: {
    input: 'uniqueId123',
    validOutput: {
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
      forDefiTxId: '5ac078ee-a549-474d-8f93-983177949764',
      signature:
        'ae33e0e52b70a23c8f05280a8a60cf99aa530994ca0aaf47a494372ecbaca685764866af903aa7447304c1c40beb790fc0b596afe1db972b8f9aa03e89898b5a01'
    },
    invalidOutput: {
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
  serializeImportPC_args: {
    input: ['stringValue', ['arrayValue'], 'string1', ['string2'], new BN(123)],
    output: {
      type: 'Buffer',
      data: [115, 101, 114, 105, 97, 108, 105, 122, 101, 100, 85, 84, 88, 79, 83, 101, 116]
    }
  },
  addFlagForSentSignedTx: {
    mock: {
      validId: 'validId',
      serialisedData: '{"isSentToChain": false}',
      invalidId: 'nonExistentId'
    }
  },
  isAlreadySentToChain: {
    mock: { validId: 'existingSentId',
    sentSerialisedData: '{"isSentToChain": true}',
    validUnsentId: "existingNotSentId",
    unsentSerialisedData: '{"isSentToChain": false}',
    invalidid: "nonExistentId"
   }
  }
};

export default fixtures;
