import { createWithdrawalTransaction, sendSignedWithdrawalTransaction } from '../../src/withdrawal';
import { contextEnv } from '../../src/constants';
import fixtures from '../fixtures/withdrawal.data';
describe('withdrawal Testcases', () => {
  describe('createWithdrawalTransaction Testcases', () => {
    test('Should create the withdrawl trx with nonce', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const inputData = fixtures.createWithdrawalTransaction.input;
      jest.spyOn(require('../../src/utils'), 'saveUnsignedWithdrawalTx').mockReturnValue(true);
      const result = await createWithdrawalTransaction(
        ctx,
        inputData.toAddress,
        inputData.amount,
        inputData.id,
        inputData.nonce
      );
      expect(result).toBe(inputData.id);
    });

    test('Should create the withdrawl trx without nonce', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const inputData = fixtures.createWithdrawalTransaction.input;
      jest.spyOn(require('../../src/utils'), 'saveUnsignedWithdrawalTx').mockReturnValue(true);
      //@ts-ignore
      const result = await createWithdrawalTransaction(
        ctx,
        inputData.toAddress,
        inputData.amount,
        inputData.id,
        //@ts-ignore
        undefined
      );
      expect(result).toBe(inputData.id);
    });
  });

  describe('sendSignedWithdrawalTransaction Testcases', () => {
    test('Should send the transaction', async () => {
      let ctx = contextEnv('.env', 'localflare');
      ctx.web3.sendSignedTransaction = jest.fn().mockReturnValue(true);

      const mockWaitFinalize3 = jest.fn(async (address, func) => {
        await func(); // Simulate transaction sending
        return { transactionHash: fixtures.sendSignedWithdrawalTransaction.mock.transactionHash };
      });
      jest.spyOn(ctx.web3.eth, 'sendSignedTransaction').mockResolvedValue({});
      jest.spyOn(ctx.web3.eth, 'getTransactionCount').mockResolvedValue(1);

      jest
        .spyOn(require('../../src/utils'), 'waitFinalize3Factory')
        .mockReturnValue(mockWaitFinalize3);
      jest
        .spyOn(require('../../src/utils'), 'readUnsignedWithdrawalTx')
        .mockReturnValue(fixtures.sendSignedWithdrawalTransaction.mock.readUnsignedWithdrawalTx);
      jest
        .spyOn(require('../../src/utils'), 'readSignedWithdrawalTx')
        .mockReturnValue(fixtures.sendSignedWithdrawalTransaction.mock.readSignedWithdrawalTx);

      const result = await sendSignedWithdrawalTransaction(
        ctx,
        fixtures.sendSignedWithdrawalTransaction.input.id
      );
      expect(result).toBe(fixtures.sendSignedWithdrawalTransaction.mock.transactionHash)
    });
  });
});
