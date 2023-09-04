import { BN } from '@flarenetwork/flarejs/dist';
const fixtures = {
  getImportExportPCParams: {
    amount: new BN(100),
    threshold: 2
  },
  issueSignedPvmTx: {
    mock: {
      signedTxJson: {
        transactionType: 'pvmAtomicTx',
        serialization: 'dummy-serialization',
        signatureRequests: [
          {
            messgae: 'message1',
            signer: 'signer1'
          },
          {
            messgae: 'message2',
            signer: 'signer2'
          }
        ],
        unsignedTransactionBuffer: 'dummy-trx-buffer',
        signature: "dummy-signature"
      }
    }
  }
};

export default fixtures;
