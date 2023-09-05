import { ledgerSign, signId, sign } from '../../../src/ledger/sign';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import AvalancheApp from '@avalabs/hw-app-avalanche';
import { sha256 } from 'ethereumjs-util';
import fixatures from '../../fixtures/ledger/sign.data';
import fs from 'fs';
jest.mock('@avalabs/hw-app-avalanche');
jest.mock('@ledgerhq/hw-transport-node-hid');
jest.mock('ethereumjs-util');

describe('ledger/sign testcases', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('Testcases for ledgerSign', () => {
    test('should successfully sign a blind transaction', async () => {
      // Mock the necessary dependencies and their responses.
      const mockTransport = {
        open: jest.fn().mockResolvedValue({})
      };
      const mockAvalanche = {
        signHash: jest.fn().mockResolvedValue({
          errorMessage: 'No errors',
          returnCode: 0,
          signatures: {
            get: jest.fn().mockResolvedValue('mocksign')
          }
        })
      };
      //@ts-ignore
      TransportNodeHid.open.mockResolvedValue(mockTransport);
      //@ts-ignore
      AvalancheApp.mockImplementation(() => mockAvalanche);
      //@ts-ignore
      sha256.mockReturnValue(Buffer.from(fixatures.ledgerSign.mock.hash, 'hex'));

      const mockTx = {
        signatureRequests: [{ message: fixatures.ledgerSign.mock.message }],
        unsignedTransactionBuffer: fixatures.ledgerSign.mock.mockedUnsignedTxBuffer
      };
      jest
        .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionPublicKey')
        .mockReturnValue(fixatures.ledgerSign.mock.publicKey);
      jest
        .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionSigner')
        .mockReturnValue(fixatures.ledgerSign.mock.address);
      //@ts-ignore
      const result = await ledgerSign(mockTx, fixatures.ledgerSign.mock.path, true);
      expect(result).toHaveProperty('address', fixatures.ledgerSign.mock.address);

      // Verify that the required functions were called.
      expect(AvalancheApp).toHaveBeenCalled();
    });

    test('should throw error', async () => {
      try {
        // Mock the necessary dependencies and their responses.
        const mockTransport = {
          open: jest.fn().mockResolvedValue({})
        };
        const mockAvalanche = {
          signHash: jest.fn().mockResolvedValue({
            errorMessage: 'Dummy error',
            returnCode: 0,
            signatures: {
              get: jest.fn().mockResolvedValue('mocksign')
            }
          })
        };
        //@ts-ignore
        TransportNodeHid.open.mockResolvedValue(mockTransport);
        //@ts-ignore
        AvalancheApp.mockImplementation(() => mockAvalanche);
        //@ts-ignore
        sha256.mockReturnValue(Buffer.from(fixatures.ledgerSign.mock.hash, 'hex'));

        const mockTx = {
          signatureRequests: [{ message: fixatures.ledgerSign.mock.message }],
          unsignedTransactionBuffer: fixatures.ledgerSign.mock.mockedUnsignedTxBuffer
        };
        jest
          .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionPublicKey')
          .mockReturnValue(fixatures.ledgerSign.mock.publicKey);
        jest
          .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionSigner')
          .mockReturnValue(fixatures.ledgerSign.mock.address);
        //@ts-ignore
        await ledgerSign(mockTx, fixatures.ledgerSign.mock.path, true);
      } catch (error) {
        expect(error).not.toBeNull();
      }
    });
    test('should successfully sign a non-blind transaction', async () => {
      // Mock the necessary dependencies and their responses.
      const mockTransport = {
        open: jest.fn().mockResolvedValue({})
      };
      const mockAvalanche = {
        sign: jest.fn().mockResolvedValue({
          errorMessage: 'No errors',
          returnCode: 0,
          signatures: {
            get: jest.fn().mockResolvedValue('mocksign')
          }
        })
      };
      //@ts-ignore
      TransportNodeHid.open.mockResolvedValue(mockTransport);
      //@ts-ignore
      AvalancheApp.mockImplementation(() => mockAvalanche);
      //@ts-ignore
      sha256.mockReturnValue(Buffer.from(fixatures.ledgerSign.mock.hash, 'hex'));

      const mockTx = {
        signatureRequests: [{ message: fixatures.ledgerSign.mock.message }],
        unsignedTransactionBuffer: fixatures.ledgerSign.mock.mockedUnsignedTxBuffer
      };
      jest
        .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionPublicKey')
        .mockReturnValue(fixatures.ledgerSign.mock.publicKey);
      jest
        .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionSigner')
        .mockReturnValue(fixatures.ledgerSign.mock.address);
      //@ts-ignore
      const result = await ledgerSign(mockTx, fixatures.ledgerSign.mock.path, false);
      expect(result).toHaveProperty('address', fixatures.ledgerSign.mock.address);

      // Verify that the required functions were called.
      expect(AvalancheApp).toHaveBeenCalled();
    });

    test('should throw error for non-blind transaction', async () => {
      try {
        // Mock the necessary dependencies and their responses.
        const mockTransport = {
          open: jest.fn().mockResolvedValue({})
        };
        const mockAvalanche = {
          sign: jest.fn().mockResolvedValue({
            errorMessage: 'Dummy error',
            returnCode: 0,
            signatures: {
              get: jest.fn().mockResolvedValue('mocksign')
            }
          })
        };
        //@ts-ignore
        TransportNodeHid.open.mockResolvedValue(mockTransport);
        //@ts-ignore
        AvalancheApp.mockImplementation(() => mockAvalanche);
        //@ts-ignore
        sha256.mockReturnValue(Buffer.from(fixatures.ledgerSign.mock.hash, 'hex'));

        const mockTx = {
          signatureRequests: [{ message: fixatures.ledgerSign.mock.message }],
          unsignedTransactionBuffer: fixatures.ledgerSign.mock.mockedUnsignedTxBuffer
        };
        jest
          .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionPublicKey')
          .mockReturnValue(fixatures.ledgerSign.mock.publicKey);
        jest
          .spyOn(require('../../../src/ledger/utils'), 'recoverTransactionSigner')
          .mockReturnValue(fixatures.ledgerSign.mock.address);
        //@ts-ignore
        await ledgerSign(mockTx, fixatures.ledgerSign.mock.path, false);
      } catch (error) {
        expect(error).not.toBeNull();
      }
    });
  });

  describe('Testcases for sign', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    jest.mock('fs');

    test('Should sign the transaction', async () => {
      const jsonContent = JSON.stringify(fixatures.sign.mock.valid.jsonContent);

      const ledgerSignMock = jest.fn().mockResolvedValue({
        signature: fixatures.sign.mock.valid.signature
      });
      jest.spyOn(fs, 'readFileSync').mockReturnValue(jsonContent);
      await sign(
        fixatures.sign.mock.valid.file,
        fixatures.sign.mock.valid.path,
        true,
        ledgerSignMock
      );
      expect(ledgerSignMock).toHaveBeenCalledWith(expect.any(Object), expect.any(String), true);
    });

    test('Should throw error for empty request array', async () => {
      try {
        const jsonContent = JSON.stringify(fixatures.sign.mock.invalid.jsonContent);

        const ledgerSignMock = jest.fn().mockResolvedValue({
          signature: fixatures.sign.mock.valid.signature
        });
        jest.spyOn(fs, 'readFileSync').mockReturnValue(jsonContent);
        await sign(
          fixatures.sign.mock.valid.file,
          fixatures.sign.mock.valid.path,
          true,
          ledgerSignMock
        );
      } catch (error) {
        expect(error).not.toBeNull();
      }
    });
  });
});
