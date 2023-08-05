import { privateKeyToEncodedPublicKey } from '../../src/utils';
import fixtures from '../fixtures/utilsData';
describe('Unit Test Cases for utils', () => {
  describe('privateKeyToEncodedPublicKey Testcases', () => {
    test('Should pass for valid input for privateKey and compres is true', () => {
      const encodedPublicKey = privateKeyToEncodedPublicKey(
        fixtures.privateKeyToEncodedPublicKey.input.DUMMY_PRIVATE_KEY
      );
      expect(encodedPublicKey).toBe(
        fixtures.privateKeyToEncodedPublicKey.output.COMPRESSED_PUBLIC_KEY
      );
    });
    test('Should pass for valid input for privateKey and compress is false', () => {
      const encodedPublicKey = privateKeyToEncodedPublicKey(
        fixtures.privateKeyToEncodedPublicKey.input.DUMMY_PRIVATE_KEY,
        false
      );
      console.log(encodedPublicKey);
      expect(encodedPublicKey).toBe(
        fixtures.privateKeyToEncodedPublicKey.output.UNCOMPRESSED_PUBLIC_KEY
      );
    });
    test('Should fail for empty privateKey', () => {
      expect(() => {
        privateKeyToEncodedPublicKey('');
      }).toThrow();
    });
  });
});
