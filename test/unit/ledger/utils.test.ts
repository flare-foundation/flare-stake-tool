import * as ethutil from 'ethereumjs-util';
import {
  privateKeyToPublicKeyEncoding,
  standardizePublicKey,
  recoverTransactionPublicKey,
  parseDerivationPath
} from '../../../src/ledger/utils';
import fixtures from '../../fixtures/ledger/utils.data';

describe('ledger/utils testcases', () => {
  describe('privateKeyToPublicKeyEncoding Testcases', () => {
    test('Should convert to encoded pubickey', async () => {
      const publicKeyEncoding = await privateKeyToPublicKeyEncoding(
        fixtures.privateKeyToPublicKeyEncoding.privateKey
      );
      expect(publicKeyEncoding).toBe(fixtures.privateKeyToPublicKeyEncoding.publicKeyEncoding);
    });
  });

  describe('standardizePublicKey Testcases', () => {
    test('Should standardize the public key', async () => {
      const standardizedPublicKey = await standardizePublicKey(
        fixtures.standardizePublicKey.publicKey
      );
      expect(standardizedPublicKey).toBe(fixtures.standardizePublicKey.standardizedPublicKey);
    });
  });

  describe('recoverTransactionPublicKey Testcases', () => {
    test('Should recover the publicKey', async () => {
      const messageBuffer = Buffer.alloc(32); // Create a 32-byte buffer
      messageBuffer.write(fixtures.recoverTransactionPublicKey.message, 0, 'utf-8');
      const signature = await ethutil.ecsign(
        messageBuffer,
        fixtures.recoverTransactionPublicKey.privateKey
      );
      const publicKey = recoverTransactionPublicKey(
        messageBuffer,
        ethutil.toRpcSig(signature.v, signature.r, signature.s)
      );
      expect(publicKey).toBeDefined();
      expect(publicKey instanceof Buffer).toBe(true);
      expect(publicKey.length).toBe(64);
    });
  });

  describe('parseDerivationPath', () => {
    test('should expand a valid derivation path', () => {
      const derivationPath = "m/44'/60'/0'/0/0";
      const result = parseDerivationPath(derivationPath);
      expect(result).toEqual({
        accountPath: "m/44'/60'/0'",
        signPath: '0/0'
      });
    });

    test('should handle an empty derivation path', () => {
      const derivationPath = '';
      const result = parseDerivationPath(derivationPath);
      expect(result).toEqual({
        accountPath: '',
        signPath: ''
      });
    });

    test('should handle a derivation path with only one component', () => {
      const derivationPath = 'm';
      const result = parseDerivationPath(derivationPath);
      expect(result).toEqual({
        accountPath: '',
        signPath: 'm'
      });
    });

    test('should handle a derivation path with multiple components', () => {
      const derivationPath = "m/44'/60'/0'/0/0/1/2";
      const result = parseDerivationPath(derivationPath);
      expect(result).toEqual({
        accountPath: "m/44'/60'/0'/0/0",
        signPath: '1/2'
      });
    });
  });
});
