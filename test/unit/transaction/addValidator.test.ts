import { addValidator, getAddValidatorParams, getUnsignedAddValidator } from '../../../src/transaction/addValidator';
import { contextEnv } from '../../../src/context';
import { Context } from '../../../src/interfaces';
import fixtures from '../../fixtures/addValidator.data';

describe('addValidator Testcases', () => {
  describe('getAddValidatorParams Testcases', () => {
    let ctx: Context = contextEnv('.env', 'localflare');
    test('Should return valid Validator params', async () => {
      try {
        const inputObject = fixtures.getAddValidatorParams.input;
        const params = await getAddValidatorParams(
          ctx,
          inputObject.nodeID,
          inputObject.stakeAmount,
          inputObject.startTime,
          inputObject.endTime,
          inputObject.delegationFee
        );
        expect(params).not.toBeNull;
      } catch (error) {
        console.log(error);
      }
    });
  });

  describe('getUnsignedAddValidator Testcases', () => {
    test('Should throw error for stake amount less than 2000000000000', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const inputObject = fixtures.getUnsignedAddValidator.invalidStakeAmount;
      await expect(() =>
        getUnsignedAddValidator(
          ctx,
          inputObject.nodeID,
          inputObject.stakeAmount,
          inputObject.startTime,
          inputObject.endTime,
          inputObject.delegationFee
        )
      ).rejects.toThrow(
        'PlatformVMAPI.buildAddValidatorTx -- stake amount must be at least 2000000000000'
      );
    });

    test('Should throw error for invalid start time', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const inputObject = fixtures.getUnsignedAddValidator.invalidStartTime;

      await expect(() =>
        getUnsignedAddValidator(
          ctx,
          inputObject.nodeID,
          inputObject.stakeAmount,
          inputObject.startTime,
          inputObject.endTime,
          inputObject.delegationFee
        )
      ).rejects.toThrow(
        'PlatformVMAPI.buildAddValidatorTx -- startTime must be in the future and endTime must come after startTime'
      );
    });

    test('Should throw error for insuffient balance', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const inputObject = fixtures.getUnsignedAddValidator.insufficientBalance;

      await expect(() =>
        getUnsignedAddValidator(
          ctx,
          inputObject.nodeID,
          inputObject.stakeAmount,
          inputObject.startTime,
          inputObject.endTime,
          inputObject.delegationFee
        )
      ).rejects.toThrow(
        'Error - UTXOSet.getMinimumSpendable: insufficient funds to create the transaction'
      );
    });

    test('Should return unsigned trx', async () => {
      const inputObject = fixtures.getUnsignedAddValidator.insufficientBalance;
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../../src/utils');
      const spy = jest.spyOn(utils, 'serializeUnsignedTx');
      spy.mockReturnValue('abcd');
      ctx.pchain.buildAddValidatorTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.pchain.buildAddValidatorTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('abcd');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('abcd');
      const result = await getUnsignedAddValidator(
        ctx,
        inputObject.nodeID,
        inputObject.stakeAmount,
        inputObject.startTime,
        inputObject.endTime,
        inputObject.delegationFee
      );
      expect(result).toHaveProperty('transactionType', 'stake');
      jest.clearAllMocks();
    });
  });

  describe('addValidator Testcases', () => {
    test('Should successfully add validator', async () => {
      const inputObject = fixtures.getUnsignedAddValidator.insufficientBalance;
      let ctx: Context = contextEnv('.env', 'localflare');
      ctx.pchain.buildAddValidatorTx = jest.fn();
      const mockUnsignedTx = {
        sign: jest.fn().mockReturnThis()
      } as any;
      const mockTx = {} as any;
      //@ts-ignore
      ctx.pchain.buildAddValidatorTx.mockResolvedValue(mockUnsignedTx);
      mockUnsignedTx.sign.mockReturnValue(mockTx);
      ctx.pchain.issueTx = jest.fn().mockResolvedValue('mockedTxId');
      const result = await addValidator(
        ctx,
        inputObject.nodeID,
        inputObject.stakeAmount,
        inputObject.startTime,
        inputObject.endTime,
        inputObject.delegationFee
      );
      expect(result).toEqual({ txid: 'mockedTxId' });
      jest.clearAllMocks();
    });
  })
});
