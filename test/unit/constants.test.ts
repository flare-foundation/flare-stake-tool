import {
  readContextFile,
  context,
  contextEnv,
  contextFile,
  networkFromContextFile,
  getConfig
} from '../../src/constants';
import fs from 'fs';
import fixtures from '../fixtures/constants.data';
describe('constants Testcases', () => {
  describe('readContextFile Testcases', () => {
    jest.mock('fs');
    const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should read and parse valid JSON file', () => {
      const mockFileContents = JSON.stringify(fixtures.readContextFile.valid);
      mockReadFileSync.mockReturnValueOnce(mockFileContents);

      const result = readContextFile('dummy/path.json');

      expect(result).toEqual(fixtures.readContextFile.valid);
      expect(mockReadFileSync).toHaveBeenCalledWith('dummy/path.json', 'utf8');
    });

    test('should handle invalid JSON file', () => {
      const mockFileContents = 'not-a-json-file';
      mockReadFileSync.mockReturnValueOnce(mockFileContents);

      // Using a callback to expect the function to throw an error
      expect(() => {
        readContextFile('dummy/path.json');
      }).toThrowError();

      expect(mockReadFileSync).toHaveBeenCalledWith('dummy/path.json', 'utf8');
    });
  });

  describe('context Testcases', () => {
    test('Should work without passing any of optional parameters', () => {
      const contextOutput = context(fixtures.context.valid.networkConfig);
      expect(contextOutput).not.toBeNull;
      expect(contextOutput.config.hrp).toBe(fixtures.context.valid.networkConfig.hrp);
      expect(contextOutput.config.ip).toBe(fixtures.context.valid.networkConfig.ip);
      expect(contextOutput.config.protocol).toBe(fixtures.context.valid.networkConfig.protocol);
    });

    test('Should work when public key is passed along with network config', () => {
      const contextOutput = context(
        fixtures.context.valid.networkConfig,
        fixtures.context.valid.publicKey
      );
      expect(contextOutput).not.toBeNull;
      expect(contextOutput.publicKey).not.toBeNull;
      expect(contextOutput.cAddressHex).toBe(fixtures.context.valid.cAddressHex);
    });

    test('Should work when public key, private key hex is passed along with network config', () => {
      const contextOutput = context(
        fixtures.context.valid.networkConfig,
        fixtures.context.valid.publicKey,
        fixtures.context.valid.privkHex
      );
      expect(contextOutput.privkHex).toBe(fixtures.context.valid.privkHex);
      expect(contextOutput.privkCB58).toBe(fixtures.context.valid.privkCB58);
    });

    test('Should work when public key, private key CB58 is passed along with network config', () => {
      const contextOutput = context(
        fixtures.context.valid.networkConfig,
        fixtures.context.valid.publicKey,
        '',
        fixtures.context.valid.privkCB58
      );
      expect(contextOutput.privkHex).toBe(fixtures.context.valid.privkHex);
      expect(contextOutput.privkCB58).toBe(fixtures.context.valid.privkCB58);
    });

    test('Should throw error when invalid private key hex is passed', () => {
      expect(() => {
        context(
          fixtures.context.valid.networkConfig,
          fixtures.context.invalid.publicKey,
          fixtures.context.invalid.privkHex
        );
      }).toThrowError;
    });
  });

  describe('contextEnv Testcases', () => {
    test('Should return context successfully', () => {
      const context = contextEnv('.env', 'localflare');
      expect(context).not.toBeNull;
    });

    test('Should fail for invalid network', () => {
      expect(() => contextEnv('.env', 'invalid-network')).toThrowError('Invalid network');
    });
  });

  describe('contextFile Testcases', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('Should return the context', () => {
      const context = contextFile('ctx.json');
      expect(context).not.toBeNull;
    });

    test('Should throw error as file does not exist', () => {
      expect(() => contextFile('')).toThrowError();
    });
  });

  describe('networkFromContextFile Testcases', () => {
    test('Should return network for valid file', () => {
      const network = networkFromContextFile('ctx.json');
      expect(network).toBe('localflare');
    });

    test('Should throw error as file does not exist', () => {
      expect(() => networkFromContextFile('')).toThrowError();
    });
  });

  describe('getConfig Testcases', () => {
    test('should return flare config if network is flare or undefined', () => {
      const network = 'flare';
      const flareConfig = getConfig(network);
      expect(flareConfig).not.toBeNull;
      expect(flareConfig.hrp).toBe(network);
      expect(getConfig(undefined)).not.toBeNull;
    });

    test('should return costwo config if network is costwo', () => {
        const network = 'costwo';
        const costwo = getConfig(network);
        expect(costwo).not.toBeNull;
        expect(costwo.hrp).toBe(network);
    });

    test('should return localflare config if network is localflare', () => {
        const network = 'localflare';
        const localflare = getConfig(network);
        expect(localflare).not.toBeNull;
        expect(localflare.hrp).toBe(network);
    });

    test('should throw an error for an invalid network', () => {
      expect(() => getConfig('invalidnetwork')).toThrowError('Invalid network');
    });
  });
});
