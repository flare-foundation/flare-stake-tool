const fixtures = {
  createWithdrawalTransaction: {
    input: {
      toAddress: '0x5913760160d245d0C9A05a8a956012694281bEE3',
      amount: 10,
      id: 'id-123',
      nonce: 1
    }
  },
  sendSignedWithdrawalTransaction: {
    input: {
      id: 'id-123'
    },
    mock: {
      readUnsignedWithdrawalTx: {
        rawTx: {
          nonce: 1,
          gasPrice: 500000000000,
          gasLimit: 8000000,
          to: '0x5913760160d245d0C9A05a8a956012694281bEE3',
          value: '10000000000',
          chainId: 162
        },
        message: '95653d16eac444494aaf39d357573591ee0689432943245032ec5a25fd36b888',
        forDefiHash: 'lWU9FurERElKrznTV1c1ke4GiUMpQyRQMuxaJf02uIg='
      },
      readSignedWithdrawalTx: {
        rawTx: {
          nonce: 1,
          gasPrice: 500000000000,
          gasLimit: 8000000,
          to: '0x5913760160d245d0C9A05a8a956012694281bEE3',
          value: '10000000000',
          chainId: 162
        },
        message: '95653d16eac444494aaf39d357573591ee0689432943245032ec5a25fd36b888',
        forDefiHash: 'lWU9FurERElKrznTV1c1ke4GiUMpQyRQMuxaJf02uIg=',
        signature: 'e2b47e849f20c9fa46d3c0df5b5c846631a978835b17a2b370d348a5560c1734623807c9e9ca9775fd263a4e7caccae8fed655622eb761df949d6740d9600d651b'
      },
      transactionHash: "0xTransactionHash"
    }
  }
};

export default fixtures;
