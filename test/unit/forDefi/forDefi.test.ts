const fetch = require('node-fetch');
const fs = require('fs');
import * as forDefi from '../../../src/forDefi/transaction';
import fixtures from '../../fixtures/forDefi.data';
import crypto from 'crypto';

jest.mock('node-fetch');
jest.mock('fs');
describe('forDefi Testcases', () => {
  const { Response } = jest.requireActual('node-fetch');
  describe('getVaultPublickey', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });

    test('Should return pubKeyHex', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            public_key_compressed: fixtures.getVaultPublickey.mock.publicKeyBase64
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );

      jest.spyOn(fs, 'readFileSync').mockReturnValue(fixtures.getVaultPublickey.mock.accessToken);
      const result = await forDefi.getVaultPublickey(fixtures.getVaultPublickey.mock.vaultId);
      expect(result).toBe(fixtures.getVaultPublickey.output);
      jest.clearAllMocks();
    });
  });

  describe('getSignature', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });

    test('Should fetch and return the signature', async () => {
      // Mock fetch response
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            signatures: [
              {
                data: fixtures.getSignature.mock.responseSignatureData
              }
            ]
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );
      jest.spyOn(fs, 'readFileSync').mockResolvedValueOnce(fixtures.getSignature.mock.accesstoken);
      // Mock readFileSync and other functions
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const utils = require('../../../src/utils');
      jest
        .spyOn(utils, 'readUnsignedTxJson')
        .mockReturnValue(fixtures.getSignature.mock.unsignedtrx.txidObj);

      const result = await forDefi.getSignature(fixtures.getSignature.mock.unsignedTxidFile);
      expect(result).toBe(fixtures.getSignature.output);
      jest.clearAllMocks();
    });

    test('Should handle unsigned withdrawal transaction', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            signatures: [
              {
                data: fixtures.getSignature.mock.responseSignatureData
              }
            ]
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );
      jest.spyOn(fs, 'readFileSync').mockResolvedValueOnce(fixtures.getSignature.mock.accesstoken);
      // Mock readFileSync and other functions
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const utils = require('../../../src/forDefi/utils');
      jest
        .spyOn(utils, 'readUnsignedWithdrawalTx')
        .mockReturnValue(fixtures.getSignature.mock.unsignedWithdrawlTrx.txidObj);

      const result = await forDefi.getSignature(fixtures.getSignature.mock.unsignedTxidFile);
      expect(result).toBe(fixtures.getSignature.output);
      jest.clearAllMocks();
    });

    test('Should throw error for missing signatures', async () => {
      // Mock fetch response with no signatures
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            signatures: []
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );

      jest.spyOn(fs, 'readFileSync').mockResolvedValueOnce(fixtures.getSignature.mock.accesstoken);
      // Mock readFileSync and other functions
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const utils = require('../../../src/utils');
      jest
        .spyOn(utils, 'readUnsignedTxJson')
        .mockReturnValue(fixtures.getSignature.mock.unsignedtrx.txidObj);

      // Assertions
      await expect(
        forDefi.getSignature(fixtures.getSignature.mock.unsignedTxidFile)
      ).rejects.toThrow('Transaction is not signed yet');
      jest.clearAllMocks();
    });
  });

  describe('sendToForDefi', () => {
    afterEach(() => {
      jest.clearAllMocks(); // Clear mocks after each test case
    });
    test('Should work for unsigned trx', async () => {
      jest.mock('../../../src/forDefi/forDefi');
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.accessToken);
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(
        JSON.stringify({
          vaultId: fixtures.sendToForDefi.mock.vaultId,
          publicKey: fixtures.sendToForDefi.mock.publicKey
        })
      );
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.secretPem);
      //@ts-ignore
      jest.spyOn(crypto, 'createPrivateKey').mockReturnValue(fixtures.sendToForDefi.mock.secretPem);
      const signMock = {
        update: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnValue(fixtures.sendToForDefi.mock.signature1)
      };
      //@ts-ignore
      jest.spyOn(crypto, 'createSign').mockReturnValue(signMock);
      jest
        .spyOn(require('../../../src/utils'), 'readUnsignedTxJson')
        .mockReturnValue(fixtures.sendToForDefi.mock.unsignedtrx.txidObj);

      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const dummyGetVaultPublickeyjest = jest
        .fn()
        .mockReturnValue(fixtures.sendToForDefi.mock.vaultPublicKey);

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            id: fixtures.sendToForDefi.mock.txId
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );

      const result = await forDefi.sendToForDefi(
        fixtures.sendToForDefi.input.unsignedTxidFile,
        fixtures.sendToForDefi.input.ctxFile,
        false,
        dummyGetVaultPublickeyjest
      );
      expect(result).toBe(fixtures.sendToForDefi.mock.txId);
      jest.clearAllMocks();
    });
    test('Should work for unsigned  withdrawl trx', async () => {
      jest.mock('../../../src/forDefi/forDefi');
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.accessToken);
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(
        JSON.stringify({
          vaultId: fixtures.sendToForDefi.mock.vaultId,
          publicKey: fixtures.sendToForDefi.mock.publicKey
        })
      );
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.secretPem);
      //@ts-ignore
      jest.spyOn(crypto, 'createPrivateKey').mockReturnValue(fixtures.sendToForDefi.mock.secretPem);
      const signMock = {
        update: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnValue(fixtures.sendToForDefi.mock.signature1)
      };
      //@ts-ignore
      jest.spyOn(crypto, 'createSign').mockReturnValue(signMock);
      jest
        .spyOn(require('../../../src/forDefi/utils'), 'readUnsignedWithdrawalTx')
        .mockReturnValue(fixtures.sendToForDefi.mock.unsignedWithdrawlTrx.txidObj);

      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const dummyGetVaultPublickeyjest = jest
        .fn()
        .mockReturnValue(fixtures.sendToForDefi.mock.vaultPublicKey);

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            id: fixtures.sendToForDefi.mock.txId
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );

      const result = await forDefi.sendToForDefi(
        fixtures.sendToForDefi.input.unsignedTxidFile,
        fixtures.sendToForDefi.input.ctxFile,
        true,
        dummyGetVaultPublickeyjest
      );
      expect(result).toBe(fixtures.sendToForDefi.mock.txId);
      jest.clearAllMocks();
    });

    test('Should throw error for public key mismatch', async () => {
      jest.mock('../../../src/forDefi/forDefi');
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.accessToken);
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(
        JSON.stringify({
          vaultId: fixtures.sendToForDefi.mock.vaultId,
          publicKey: fixtures.sendToForDefi.mock.publicKey
        })
      );
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(fixtures.sendToForDefi.mock.secretPem);
      //@ts-ignore
      jest.spyOn(crypto, 'createPrivateKey').mockReturnValue(fixtures.sendToForDefi.mock.secretPem);
      const signMock = {
        update: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnValue(fixtures.sendToForDefi.mock.signature1)
      };
      //@ts-ignore
      jest.spyOn(crypto, 'createSign').mockReturnValue(signMock);
      jest
        .spyOn(require('../../../src/utils'), 'readUnsignedTxJson')
        .mockReturnValue(fixtures.sendToForDefi.mock.unsignedtrx.txidObj);

      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const dummyGetVaultPublickeyjest = jest.fn().mockReturnValue('incorrect-vault-key');

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(
          JSON.stringify({
            id: fixtures.sendToForDefi.mock.txId
          }),
          {
            status: 200,
            statusText: 'OK'
          }
        )
      );
      await expect(
        forDefi.sendToForDefi(
          fixtures.sendToForDefi.input.unsignedTxidFile,
          fixtures.sendToForDefi.input.ctxFile,
          false,
          dummyGetVaultPublickeyjest
        )
      ).rejects.toThrow('public key does not match the vault');
      jest.clearAllMocks();
    });
  });
});
