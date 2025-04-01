import {
  getExportPCParams,
  getImportCPParams,
  getUnsignedExportTxPC,
  getUnsignedImportTxCP,
  exportTxPC,
  importTxCP,
  issueSignedPvmTx
} from '../../../src/transaction/pvmAtomicTx';
import { contextEnv } from '../../../src/context';
import { Context } from '../../../src/interfaces';
import fixtures from '../../fixtures/pvmAtomicTx.data';
import { UTXOSet, UnsignedTx, Tx } from '@flarenetwork/flarejs/dist/apis/platformvm';

describe('pvmAtomicTx testcases', () => {
  describe('getExportPCParams', () => {
    test('Should return params successfully', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const params = await getExportPCParams(ctx, fixtures.getImportExportPCParams.amount);
      expect(params).toBeInstanceOf(Array);
    });
    test('Should return params successfully when no amount is passed', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const params = await getExportPCParams(ctx);
      expect(params).toBeInstanceOf(Array);
    });
    test('Should retunrn params successfully for dynamic threshold', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const params = await getExportPCParams(
        ctx,
        fixtures.getImportExportPCParams.amount,
        fixtures.getImportExportPCParams.threshold
      );
      expect(params).toBeInstanceOf(Array);
    });
  });

  describe('getImportCPParams', () => {
    test('Should return the params successfully', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const params = await getImportCPParams(ctx);
      expect(params).toBeInstanceOf(Array);
    });

    test('Should return the params successfully for dynamic input', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const params = await getImportCPParams(ctx, fixtures.getImportExportPCParams.threshold);
      expect(params).toBeInstanceOf(Array);
    });
  });

  describe('getUnsignedExportTxPC', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    // mocked function to pass the
    test('Should return unsigned trx', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../../src/utils');
      const spy = jest.spyOn(utils, 'serializeUnsignedTx');
      spy.mockReturnValue('abcd');
      ctx.pchain.buildExportTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.pchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('abcd');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('abcd');
      const result = await getUnsignedExportTxPC(ctx, fixtures.getImportExportPCParams.amount);
      expect(result).toHaveProperty('transactionType', 'exportPC');
      jest.clearAllMocks();
    });

    test('Should throw error for low balance', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      await expect(
        getUnsignedExportTxPC(ctx, fixtures.getImportExportPCParams.amount)
      ).rejects.toThrow(
        'UTXOSet.getMinimumSpendable: insufficient funds to create the transaction'
      );
    });
  });

  describe('getUnsignedImportTxCP', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    // mocked function to pass the
    test('Should return unsigned trx', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../../src/utils');
      const spy = jest.spyOn(utils, 'serializeUnsignedTx');
      spy.mockReturnValue('abcd');
      ctx.pchain.buildImportTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.pchain.buildImportTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('abcd');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('abcd');
      const result = await getUnsignedImportTxCP(ctx);
      expect(result).toHaveProperty('transactionType', 'importCP');
      jest.clearAllMocks();
    });

    test('Should throw error for low balance', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      await expect(getUnsignedImportTxCP(ctx)).rejects.toThrow(
        'UTXOSet.getMinimumSpendable: insufficient funds to create the transaction'
      );
    });
  });

  describe('exportTxPC', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    test('Should execute succesfully', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      ctx.pchain.buildExportTx = jest.fn();
      const mockUnsignedTx = {
        sign: jest.fn().mockReturnThis()
      } as any;
      const mockTx = {} as any;
      //@ts-ignore
      ctx.pchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
      mockUnsignedTx.sign.mockReturnValue(mockTx);
      ctx.pchain.issueTx = jest.fn().mockResolvedValue('mockedTxId');
      const result = await exportTxPC(ctx, fixtures.getImportExportPCParams.amount);
      expect(result).toEqual({ txid: 'mockedTxId' });
    });

    test('Should throw error for low balance', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      await expect(exportTxPC(ctx, fixtures.getImportExportPCParams.amount)).rejects.toThrow(
        'UTXOSet.getMinimumSpendable: insufficient funds to create the transaction'
      );
    });
  });

  describe('importTxCP', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    test('Should execute succesfully', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      ctx.pchain.buildImportTx = jest.fn();
      const mockUnsignedTx = {
        sign: jest.fn().mockReturnThis()
      } as any;
      const mockTx = {} as any;
      //@ts-ignore
      ctx.pchain.buildImportTx.mockResolvedValue(mockUnsignedTx);
      mockUnsignedTx.sign.mockReturnValue(mockTx);
      ctx.pchain.issueTx = jest.fn().mockResolvedValue('mockedTxId');
      const result = await importTxCP(ctx);
      expect(result).toEqual({ txid: 'mockedTxId' });
    });
    test('Should throw error for low balance', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      await expect(importTxCP(ctx)).rejects.toThrow(
        'UTXOSet.getMinimumSpendable: insufficient funds to create the transaction'
      );
    });
  });

  describe('issueSignedPvmTx', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    test('Should issue transaction', () => {
      let ctx = contextEnv('.env', 'localflare');
      ctx.pchain.issueTx = jest.fn().mockReturnValue('dummy-tx-id');
      jest.spyOn(require('../../../src/utils'), 'deserializeUnsignedTx').mockReturnValue({
        signWithRawSignatures: jest.fn().mockReturnValue('dummy-tx')
      });
      jest
        .spyOn(require('../../../src/utils'), 'expandSignature')
        .mockReturnValue('expanded-signature');
      //@ts-ignore
      const result = issueSignedPvmTx(ctx, fixtures.issueSignedPvmTx.mock.signedTxJson);
    });
  });
});
