import {
  getImportPCParams,
  getExportCPParams,
  issueSignedEvmTx,
  getUnsignedImportTxPC,
  getUnsignedExportTxCP,
  importTxPC,
  exportTxCP
} from '../../src/evmAtomicTx';
import { contextEnv } from '../../src/constants';
import { Context } from '../../src/interfaces';
import fixtures from '../fixtures/evmAtomicTx.data';

describe('evmAtomicTx Testcases', () => {
  describe('getImportPCParams', () => {
    test('Should return the params with the fees', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const params = await getImportPCParams(ctx, fixtures.getImportPCParams.input.fee);
      expect(params[1]).toBe(fixtures.getImportPCParams.output.address);
    });
  });

  describe('getExportCPParams', () => {
    test('Should return the params when fee is passed but nonce is not passed', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const params = await getExportCPParams(
        ctx,
        fixtures.getExportCPParams.input.amount,
        fixtures.getExportCPParams.input.fee
      );
      expect(params[3]).toBe(fixtures.getExportCPParams.output.address);
    });

    test('Should return the params when fee is passed along with nonce', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const params = await getExportCPParams(
        ctx,
        fixtures.getExportCPParams.input.amount,
        fixtures.getExportCPParams.input.fee,
        fixtures.getExportCPParams.input.nonce
      );
      expect(params[3]).toBe(fixtures.getExportCPParams.output.address);
      expect(params[6]).toBe(fixtures.getExportCPParams.output.nonce);
    });
  });

  describe('issueSignedEvmTx function', () => {
    //@ts-ignore
    it('issues a signed EVM transaction', async () => {
      let ctx = contextEnv('.env', 'localflare');
      const utils = require('../../src/utils');
      const spy = jest.spyOn(utils, 'expandSignature');
      spy.mockReturnValue('0xabcd');
      const mockSignedTxJson = {
        // Provide your mock signedTxJson here
        signatureRequests: ['0xabc', '0xcde']
      };

      const mockUnsignedTx = {
        // Provide your mock unsignedTx here
        signWithRawSignatures: jest.fn().mockReturnValue({
          // Provide your mock Tx here
        }) as any // Mock the signWithRawSignatures method
      };

      const mockChainTxId = '123456'; // Mocked chainTxId

      const txBuilderMock = jest.fn().mockResolvedValue(mockUnsignedTx);
      ctx.cchain.issueTx = jest.fn().mockResolvedValue(mockChainTxId);
      //@ts-ignore
      const result = await issueSignedEvmTx(ctx, mockSignedTxJson, txBuilderMock);

      // Assertions
      expect(mockUnsignedTx.signWithRawSignatures).toHaveBeenCalledWith(
        expect.any(Array),
        ctx.cKeychain
      );
      expect(result).toEqual({ chainTxId: mockChainTxId });
    });
  });

  describe('getUnsignedImportTxPC ', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });

    test('Should return unsigned trx', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../src/utils');
      const spy = jest.spyOn(utils, 'serializeImportPC_args');
      spy.mockReturnValue('abcd');
      ctx.cchain.buildImportTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.cchain.buildImportTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('mockerUnsignedHashes');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('mockBufferData');
      const result = await getUnsignedImportTxPC(ctx, fixtures.getUnsignedImportTxPC.input.fee);
      expect(result.transactionType).toBe('importPC');
    });
  });

  describe('getUnsignedExportTxCP ', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });

    test('Should return unsigned trx without nonce', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../src/utils');
      const spy = jest.spyOn(utils, 'serializeExportCP_args');
      spy.mockReturnValue('abcd');
      ctx.cchain.buildExportTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.cchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('mockerUnsignedHashes');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('mockBufferData');
      const result = await getUnsignedExportTxCP(
        ctx,
        fixtures.getUnsignedExportTxCP.input.amount,
        fixtures.getUnsignedExportTxCP.input.fee
      );
      expect(result.transactionType).toBe('exportCP');
    });

    test('Should return unsigned trx with nonce', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      const utils = require('../../src/utils');
      const spy = jest.spyOn(utils, 'serializeExportCP_args');
      spy.mockReturnValue('abcd');
      ctx.cchain.buildExportTx = jest.fn();
      //@ts-ignore
      const mockUnsignedTx: UnsignedTx = {
        prepareUnsignedHashes: jest.fn(),
        toBuffer: jest.fn()
      };
      //@ts-ignore
      ctx.cchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
      //@ts-ignore
      mockUnsignedTx.prepareUnsignedHashes.mockReturnValue('mockerUnsignedHashes');
      //@ts-ignore
      mockUnsignedTx.toBuffer.mockReturnValue('mockBufferData');
      const result = await getUnsignedExportTxCP(
        ctx,
        fixtures.getUnsignedExportTxCP.input.amount,
        fixtures.getUnsignedExportTxCP.input.fee,
        fixtures.getUnsignedExportTxCP.input.nonce
      );
      expect(result.transactionType).toBe('exportCP');
    });
  });

  describe('importTxPC', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    test('Should execute the trx', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      ctx.cchain.buildImportTx = jest.fn();
      const mockUnsignedTx = {
        sign: jest.fn().mockReturnThis()
      } as any;
      const mockTx = {} as any;
      //@ts-ignore
      ctx.cchain.buildImportTx.mockResolvedValue(mockUnsignedTx);
      mockUnsignedTx.sign.mockReturnValue(mockTx);
      ctx.cchain.issueTx = jest.fn().mockResolvedValue(fixtures.importTxPC.mock.txId);
      const result = await importTxPC(ctx, fixtures.importTxPC.input.fee);
      expect(result.txid).toBe(fixtures.importTxPC.mock.txId);
      expect(result.usedFee).not.toBeNull;
    });
  });

  describe('exportTxCP', () => {
    test('Should execute when nonce is not passed', async () => {
      let ctx: Context = contextEnv('.env', 'localflare');
      ctx.cchain.buildExportTx = jest.fn();
      const mockUnsignedTx = {
        sign: jest.fn().mockReturnThis()
      } as any;
      const mockTx = {} as any;
      //@ts-ignore
      ctx.cchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
      mockUnsignedTx.sign.mockReturnValue(mockTx);
      ctx.cchain.issueTx = jest.fn().mockResolvedValue(fixtures.exportTxCP.mock.txId);
      const result = await exportTxCP(
        ctx,
        fixtures.exportTxCP.input.amount,
        fixtures.exportTxCP.input.fee
      );
      expect(result.txid).toBe(fixtures.exportTxCP.mock.txId);
      expect(result.usedFee).not.toBeNull;
    });

    test('Should execute when nonce is passed', async () => {
        let ctx: Context = contextEnv('.env', 'localflare');
        ctx.cchain.buildExportTx = jest.fn();
        const mockUnsignedTx = {
          sign: jest.fn().mockReturnThis()
        } as any;
        const mockTx = {} as any;
        //@ts-ignore
        ctx.cchain.buildExportTx.mockResolvedValue(mockUnsignedTx);
        mockUnsignedTx.sign.mockReturnValue(mockTx);
        ctx.cchain.issueTx = jest.fn().mockResolvedValue(fixtures.exportTxCP.mock.txId);
        const result = await exportTxCP(
          ctx,
          fixtures.exportTxCP.input.amount,
          fixtures.exportTxCP.input.fee,
          fixtures.exportTxCP.input.nonce
        );
        expect(result.txid).toBe(fixtures.exportTxCP.mock.txId);
        expect(result.usedFee).not.toBeNull;
      });
  });
});
