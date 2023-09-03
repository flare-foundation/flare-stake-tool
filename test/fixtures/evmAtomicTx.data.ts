import { BN } from '@flarenetwork/flarejs/dist';
const fixtures = {
  getImportPCParams: {
    input: { fee: new BN(10) },
    output: {
      address: '0xfa32c77aa014584bb9c3f69d8d1d74b8844e1a92'
    }
  },
  getExportCPParams: {
    input: { amount: new BN(100), fee: new BN(10), nonce: 2 },
    output: {
      address: '0xfa32c77aa014584bb9c3f69d8d1d74b8844e1a92',
      assetId: 'HK58c7FvFK79cbFsdFf1qVL5bVwQcCRkzZN5Ked8uZsyheeEN',
      nonce: 2
    }
  },
  getUnsignedImportTxPC: {
    input: { fee: new BN(10) }
  },
  getUnsignedExportTxCP: {
    input: { amount: new BN(100), fee: new BN(10), nonce: 3 }
  },
  importTxPC: {
    input: { fee: new BN(10) },
    mock: { txId: 'mockedTxId' }
  },
  exportTxCP: {
    input: { amount: new BN(100), fee: new BN(100), nonce: 5 },
    mock: { txId: 'mockedTxId' }
  }
};

export default fixtures;
