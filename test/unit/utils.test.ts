import {
  privateKeyToEncodedPublicKey,
  privateKeyToPublicKey,
  decodePublicKey,
  compressPublicKey,
  publicKeyToBech32AddressBuffer,
  publicKeyToBech32AddressString,
  publicKeyToEthereumAddressString,
  validatePublicKey,
  recoverMessageSigner,
  recoverTransactionSigner,
  recoverPublicKey,
  expandSignature,
  sleepms,
  unPrefix0x,
  prefix0x,
  decimalToInteger,
  integerToDecimal,
  toBN,
  serializeExportCP_args,
  deserializeExportCP_args,
  initCtxJson,
  serializeImportPC_args,
  serializeUnsignedTx,
  deserializeUnsignedTx,
  saveUnsignedTxJson,
  readUnsignedTxJson,
  readSignedTxJson,
  addFlagForSentSignedTx,
  isAlreadySentToChain,
} from '../../src/utils';
import {
  saveUnsignedWithdrawalTx,
  readUnsignedWithdrawalTx,
  readSignedWithdrawalTx,
  waitFinalize3Factory
} from '../../src/forDefi/utils';
import { UnsignedTx as EvmUnsignedTx, UTXOSet } from '@flarenetwork/flarejs/dist/apis/evm';
import { UnsignedTx as PvmUnsignedTx } from '@flarenetwork/flarejs/dist/apis/platformvm';
import fixtures from '../fixtures/utils.data';
import { getUserInput, serialize, covertBNToSting, compareValues } from '../helper/testHelpers';
import {
  forDefiDirectory,
  forDefiSignedTxnDirectory,
  forDefiUnsignedTxnDirectory
} from '../../src/constants/forDefi';


describe('Unit Test Cases for utils', () => {
  // public keys and bech32 addresses

  describe('privateKeyToEncodedPublicKey Testcases', () => {
    test('Should pass for valid input for privateKey and compres is true', () => {
      const encodedPublicKey = privateKeyToEncodedPublicKey(
        fixtures.privateKeyToEncodedPublicKey.input
      );
      expect(encodedPublicKey).toBe(
        fixtures.privateKeyToEncodedPublicKey.output.COMPRESSED_PUBLIC_KEY
      );
    });
    test('Should pass for valid input for privateKey and compress is false', () => {
      const encodedPublicKey = privateKeyToEncodedPublicKey(
        fixtures.privateKeyToEncodedPublicKey.input,
        false
      );
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

  describe('privateKeyToPublicKey Testcases', () => {
    test('Should pass for valid input for privateKey', () => {
      const publicKey = privateKeyToPublicKey(
        Buffer.from(fixtures.privateKeyToPublicKey.input, 'utf8')
      );
      // serealise as we cannt compare buffers directly
      expect(serialize(publicKey)).toBe(serialize(fixtures.privateKeyToPublicKey.output));
    });

    test('Should fail for empty input', () => {
      expect(() => {
        privateKeyToPublicKey(Buffer.from('', 'utf8'));
      }).toThrow();
    });
  });

  describe('decodePublicKey Testcases', () => {
    test('Should decode public key for valid one', () => {
      const decodedPublicKey = decodePublicKey(fixtures.decodePublicKey.input);
      expect(serialize(fixtures.decodePublicKey.output)).toBe(serialize(decodedPublicKey));
    });
    test('Should fail for empty privateKey', () => {
      expect(() => {
        decodePublicKey('');
      }).toThrow();
    });
  });

  describe('compressPublicKey Testcases', () => {
    test('Should compress public key for valid one', () => {
      const compressedPublicKey = compressPublicKey(
        fixtures.compressPublicKey.input.x,
        fixtures.compressPublicKey.input.y
      );
      expect(serialize([fixtures.compressPublicKey.output])).toBe(serialize([compressedPublicKey]));
    });
    test('Should fail for empty privateKey', () => {
      expect(() => {
        compressPublicKey(Buffer.from(''), Buffer.from(''));
      }).toThrow();
    });
  });

  describe('publicKeyToBech32AddressBuffer Testcases', () => {
    test('Should convert to address buffer for valid input', () => {
      const bech32AddressBuffer = publicKeyToBech32AddressBuffer(
        fixtures.compressPublicKey.input.x,
        fixtures.compressPublicKey.input.y
      );
      expect(serialize([fixtures.publicKeyToBech32AddressBuffer.output])).toBe(
        serialize([bech32AddressBuffer])
      );
    });
    test('Should fail for empty privateKey', () => {
      expect(() => {
        publicKeyToBech32AddressBuffer(Buffer.from(''), Buffer.from(''));
      }).toThrow();
    });
  });

  describe('publicKeyToBech32AddressString Testcases', () => {
    test('Should successfully convert to string', () => {
      const bech32AddressBuffer = publicKeyToBech32AddressString(
        fixtures.publicKeyToBech32AddressString.input,
        'abcd'
      );
      expect(bech32AddressBuffer).toBe(fixtures.publicKeyToBech32AddressString.output);
    });
    test('Should fail empty input', () => {
      expect(() => {
        publicKeyToBech32AddressString('', '');
      }).toThrow();
    });
  });

  describe('publicKeyToEthereumAddressString Testcases', () => {
    test('Should successfully convert valid public key to eth address', () => {
      const bech32AddressBuffer = publicKeyToEthereumAddressString(
        fixtures.publicKeyToEthereumAddressString.input
      );
      expect(bech32AddressBuffer).toBe(fixtures.publicKeyToEthereumAddressString.output);
    });
    test('Should fail for empty public key', () => {
      expect(() => {
        publicKeyToEthereumAddressString('');
      }).toThrow();
    });
  });

  describe('validatePublicKey Testcases', () => {
    test('Should return true for valid public key', () => {
      const isValidPublicKey = validatePublicKey(fixtures.validatePublicKey.input);
      expect(isValidPublicKey).toBe(fixtures.validatePublicKey.output);
    });

    test('Should return false for invalid public key', () => {
      const isValidPublicKey = validatePublicKey('');
      expect(isValidPublicKey).toBe(false);
    });
    test('Should fail for empty public key', () => {
      expect(() => {
        publicKeyToEthereumAddressString('');
      }).toThrow();
    });
  });

  // signatures

  describe('recoverMessageSigner Testcases', () => {
    test('Should successfully verify the signature', () => {
      const bech32AddressBuffer = recoverMessageSigner(
        Buffer.from(fixtures.recoverMessageSigner.input.message),
        fixtures.recoverMessageSigner.input.signature
      );
      expect(bech32AddressBuffer).toBe(fixtures.recoverMessageSigner.output);
    });
    test('Should not be able recover the address', () => {
      const bech32AddressBuffer = recoverMessageSigner(
        Buffer.from('xyz'),
        fixtures.recoverMessageSigner.input.signature
      );
      expect(bech32AddressBuffer).not.toBe(fixtures.recoverMessageSigner.output);
    });
    test('Should fail empty input', () => {
      expect(() => {
        recoverMessageSigner(Buffer.from(''), '');
      }).toThrow();
    });
  });

  describe('recoverTransactionSigner Testcases', () => {
    test('Should successfully recover the signer', () => {
      const recoveredTransactionSigner = recoverTransactionSigner(
        Buffer.from(fixtures.recoverTransactionSigner.input.message),
        fixtures.recoverTransactionSigner.input.signature
      );
      expect(recoveredTransactionSigner).toBe(fixtures.recoverTransactionSigner.output);
    });
    test('Should not be able recover the address', () => {
      const bech32AddressBuffer = recoverTransactionSigner(
        Buffer.from(Buffer.from('abcdefghijklmnopqrstuvwxyzabcdef')),
        fixtures.recoverTransactionSigner.input.signature
      );
      expect(bech32AddressBuffer).not.toBe(fixtures.recoverTransactionSigner.output);
    });
    test('Should fail empty input', () => {
      expect(() => {
        recoverTransactionSigner(Buffer.from(''), '');
      }).toThrow();
    });
  });

  describe('recoverPublicKey Testcases', () => {
    test('Should successfully recover the public key', () => {
      const recoveredPublicKey = recoverPublicKey(
        fixtures.recoverPublicKey.input.message,
        fixtures.recoverPublicKey.input.signature
      );
      expect(serialize([recoveredPublicKey])).toBe(
        serialize([Buffer.from(fixtures.recoverPublicKey.output)])
      );
    });
    test('Should not be able recover the public key', () => {
      const recoveredPublicKey = recoverPublicKey(
        Buffer.from('abcdefghijklmnopqrstuvwxyzabcdef'),
        fixtures.recoverPublicKey.input.signature
      );
      expect(serialize([recoveredPublicKey])).not.toBe(
        serialize([Buffer.from(fixtures.recoverPublicKey.output)])
      );
    });
    test('Should fail empty input', () => {
      expect(() => {
        recoverPublicKey(Buffer.from(''), '');
      }).toThrow();
    });
  });

  describe('expandSignature Testcases', () => {
    test('Should pass for valid signature', () => {
      const expandedSignature = expandSignature(fixtures.expandSignature.validInput.input);
      expect(covertBNToSting(expandedSignature.r)).toBe(
        fixtures.expandSignature.validInput.output.r
      );
      expect(covertBNToSting(expandedSignature.s)).toBe(
        fixtures.expandSignature.validInput.output.s
      );
      expect(covertBNToSting(expandedSignature.recoveryParam)).toBe(
        fixtures.expandSignature.validInput.output.recoveryParam
      );
    });

    test('Should return 0 for r,s', () => {
      const expandedSignature = expandSignature(fixtures.expandSignature.nullInput.input);
      expect(covertBNToSting(expandedSignature.r)).toBe(
        fixtures.expandSignature.nullInput.output.r
      );
      expect(covertBNToSting(expandedSignature.s)).toBe(
        fixtures.expandSignature.nullInput.output.s
      );
      expect(covertBNToSting(expandedSignature.recoveryParam)).toBeNaN;
    });
  });

  // general helper functions

  describe('sleepms Testcases', () => {
    jest.useFakeTimers();
    test('should wait for the specified number of milliseconds', async () => {
      const milliseconds = fixtures.sleepms.input;
      const start = new Date().getTime();
      const sleepPromise = sleepms(milliseconds);
      jest.advanceTimersByTime(milliseconds);
      await sleepPromise;
      const end = new Date().getTime();
      const elapsedMilliseconds = end - start;
      expect(elapsedMilliseconds).toBeGreaterThanOrEqual(milliseconds);
    });
  });

  describe('getUserInput Testcases', () => {
    const readline = require('readline');
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: jest.fn(),
      close: jest.fn()
    } as any);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should read user input and resolve with the input', async () => {
      const prompt = fixtures.getUserInput.input;
      const userInput = fixtures.getUserInput.output;

      (
        readline.createInterface().question as jest.MockedFunction<
          (query: string, callback: (input: string) => void) => void
        >
      ).mockImplementationOnce((_, callback) => {
        callback(userInput);
      });

      const result = await getUserInput(prompt);
      expect(result).toBe(userInput);
      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout
      });
      expect(readline.createInterface().close).toHaveBeenCalled();
    });
  });

  describe('unPrefix0x Testcases', () => {
    test('Should unprefix 0x from the string', () => {
      const output = unPrefix0x(fixtures.unPrefix0x.inputWith0xPrefix.input);
      expect(output).toBe(fixtures.unPrefix0x.inputWith0xPrefix.output);
    });
    test('Should return default value for null input', () => {
      const output = unPrefix0x(fixtures.unPrefix0x.nullInput.input);
      expect(output).toBe(fixtures.unPrefix0x.nullInput.output);
    });
    test('Should return the string as it is', () => {
      const output = unPrefix0x(fixtures.unPrefix0x.inputWithOut0xPrefix.input);
      expect(output).toBe(fixtures.unPrefix0x.inputWithOut0xPrefix.output);
    });
  });

  describe('prefix0x Testcases', () => {
    test('Should prefix 0x from the string', () => {
      const output = prefix0x(fixtures.prefix0x.inputWithOut0xPrefix.input);
      expect(output).toBe(fixtures.prefix0x.inputWithOut0xPrefix.output);
    });

    // might be incorrect
    test.skip('Should return default value for null input', () => {
      const output = prefix0x(fixtures.prefix0x.nullInput.input);
      expect(output).toBe(fixtures.prefix0x.nullInput.output);
    });
    test('Should return the string as it is', () => {
      const output = prefix0x(fixtures.prefix0x.inputWith0xPrefix.input);
      expect(output).toBe(fixtures.prefix0x.inputWith0xPrefix.output);
    });
  });

  describe('decimalToInteger Testcases', () => {
    test('Should convert a decimal number to an integer with a given offset', () => {
      const result = decimalToInteger(
        fixtures.decimalToInteger.decimalNumber.input.dec,
        fixtures.decimalToInteger.decimalNumber.input.offset
      );
      expect(result).toBe(fixtures.decimalToInteger.decimalNumber.output);
    });

    test('should convert a whole number to an integer with a given offset', () => {
      const result = decimalToInteger(
        fixtures.decimalToInteger.wholeNumber.input.dec,
        fixtures.decimalToInteger.wholeNumber.input.offset
      );
      expect(result).toBe(fixtures.decimalToInteger.wholeNumber.output);
    });

    test('should add zeros at the end when offset is larger than the decimal places', () => {
      const result = decimalToInteger(
        fixtures.decimalToInteger.largeOffset.input.dec,
        fixtures.decimalToInteger.largeOffset.input.offset
      );
      expect(result).toBe(fixtures.decimalToInteger.largeOffset.output);
    });

    test('Should convert when offset is lower than number of decimal places', () => {
      const result = decimalToInteger(
        fixtures.decimalToInteger.smallOffset.input.dec,
        fixtures.decimalToInteger.smallOffset.input.offset
      );
      expect(result).toBe(fixtures.decimalToInteger.smallOffset.output);
    });

    test('Should return the number without decimal', () => {
      const result = decimalToInteger(
        fixtures.decimalToInteger.negativeoffset.input.dec,
        fixtures.decimalToInteger.negativeoffset.input.offset
      );
      expect(result).toBe(fixtures.decimalToInteger.negativeoffset.output);
    });
  });

  describe('integerToDecimal Testcases', () => {
    test('should convert a whole number to a decimal with a given offset', () => {
      const result = integerToDecimal(
        fixtures.integerToDecimal.wholeNumber.input.int,
        fixtures.integerToDecimal.wholeNumber.input.offset
      );
      expect(result).toBe(fixtures.integerToDecimal.wholeNumber.output);
    });

    test('should convert to decimal when offset is larger than the number', () => {
      const result = integerToDecimal(
        fixtures.integerToDecimal.largeOffset.input.int,
        fixtures.integerToDecimal.largeOffset.input.offset
      );
      expect(result).toBe(fixtures.integerToDecimal.largeOffset.output);
    });

    test('should convert to decimal when offset is smaller than the number', () => {
      const result = integerToDecimal(
        fixtures.integerToDecimal.smallOffset.input.int,
        fixtures.integerToDecimal.smallOffset.input.offset
      );
      expect(result).toBe(fixtures.integerToDecimal.smallOffset.output);
    });

    test.skip('should return the number for negative offset', () => {
      const result = integerToDecimal(
        fixtures.integerToDecimal.negativeoffset.input.int,
        fixtures.integerToDecimal.negativeoffset.input.offset
      );
      expect(result).toBe(fixtures.integerToDecimal.negativeoffset.output);
    });
  });

  describe.skip('parseRelativeTime Testcases', () => {});

  describe('toBN Testcases', () => {
    test('should convert a positive number to BN', () => {
      const result = toBN(fixtures.toBN.positiveNumber.input);
      expect(result?.toString()).toBe(fixtures.toBN.positiveNumber.output.toString());
    });

    test('should convert a negaive number to BN', () => {
      const result = toBN(fixtures.toBN.negativeNumber.input);
      expect(result?.toString()).toBe(fixtures.toBN.negativeNumber.output.toString());
    });

    test('should convert a number in string to BN', () => {
      const result = toBN(fixtures.toBN.numberString.input);
      expect(result?.toString()).toBe(fixtures.toBN.numberString.output.toString());
    });

    test('should convert a big number to BN', () => {
      const result = toBN(fixtures.toBN.bigNumber.input);
      expect(result?.toString()).toBe(fixtures.toBN.bigNumber.output.toString());
    });

    test('should undefined for undefined input', () => {
      const result = toBN(fixtures.toBN.undefinedInput.input);
      expect(result?.toString()).toBeUndefined;
    });
  });

  // serialization of atomic c-chain addresses does not work correctly, so we have to improvise

  describe('serializeExportCP_args Testcases', () => {
    test('should serialize arguments with all provided values', () => {
      // @ts-ignore
      const result = serializeExportCP_args(fixtures.serializeExportCP_args.allValues.input);
      expect(result).toMatch(fixtures.serializeExportCP_args.allValues.output);
    });
    test('should serialize arguments for zero  values', () => {
      // @ts-ignore
      const result = serializeExportCP_args(fixtures.serializeExportCP_args.zeroValues.input);
      expect(result).toMatch(fixtures.serializeExportCP_args.zeroValues.output);
    });
  });

  describe('serializeUnsignedTx', () => {
    const mockSerialize = jest.fn();
    // Mock implementation for EvmUnsignedTx
    class MockEvmUnsignedTx {
      serialize = mockSerialize;
    }

    // Mock implementation for PvmUnsignedTx
    class MockPvmUnsignedTx {
      serialize = mockSerialize;
    }

    beforeEach(() => {
      mockSerialize.mockClear();
    });

    test('should serialize EvmUnsignedTx', () => {
      const mockEvmUnsignedTx = new MockEvmUnsignedTx();
      mockSerialize.mockReturnValueOnce('serializedEvmTx');
      // @ts-ignore
      const result = serializeUnsignedTx(mockEvmUnsignedTx);

      expect(result).toBe('"serializedEvmTx"');
      expect(mockSerialize).toHaveBeenCalledWith('hex');
    });

    test('should serialize PvmUnsignedTx', () => {
      const mockPvmUnsignedTx = new MockPvmUnsignedTx();
      mockSerialize.mockReturnValueOnce('serializedPvmTx');
      // @ts-ignore
      const result = serializeUnsignedTx(mockPvmUnsignedTx);

      expect(result).toBe('"serializedPvmTx"');
      expect(mockSerialize).toHaveBeenCalledWith('hex');
    });
  });

  describe('deserializeUnsignedTx', () => {
    const mockDeserialize = jest.fn();

    // @ts-ignore
    class MockEvmUnsignedTx implements EvmUnsignedTx {
      _typeName = 'EvmUnsignedTx';
      deserialize = mockDeserialize;
    }

    // Mock implementation for PvmUnsignedTx
    // @ts-ignore
    class MockPvmUnsignedTx implements PvmUnsignedTx {
      _typeName = 'PvmUnsignedTx';
      deserialize = mockDeserialize;
    }

    beforeEach(() => {
      mockDeserialize.mockClear();
    });

    test('should deserialize EvmUnsignedTx', () => {
      const mockSerializedEvmTx = '{"someProperty":"someValue"}';
      const mockEvmUnsignedTx = new MockEvmUnsignedTx();
      // @ts-ignore
      const result = deserializeUnsignedTx(MockEvmUnsignedTx, mockSerializedEvmTx);
      expect(result).toMatchObject(mockEvmUnsignedTx);
      expect(mockDeserialize).toHaveBeenCalledWith(JSON.parse(mockSerializedEvmTx));
    });

    test('should deserialize PvmUnsignedTx', () => {
      const mockSerializedPvmTx = '{"someProperty":"someValue"}';
      const mockPvmUnsignedTx = new MockPvmUnsignedTx();
      // @ts-ignore
      const result = deserializeUnsignedTx(MockPvmUnsignedTx, mockSerializedPvmTx);

      expect(result).toMatchObject(mockPvmUnsignedTx);
      expect(mockDeserialize).toHaveBeenCalledWith(JSON.parse(mockSerializedPvmTx));
    });
  });

  describe('serializeImportPC_args', () => {
    // @ts-ignore
    class MockUTXOSet implements UTXOSet {
      serialize = jest.fn(() => Buffer.from('serializedUTXOSet'));
    }
    test('should serialize import PC args', () => {
      const mockUTXOSet = new MockUTXOSet();
      const args = [mockUTXOSet, ...fixtures.serializeImportPC_args.input];
      // @ts-ignore
      const result = serializeImportPC_args(args);
      const buffer = Buffer.from(fixtures.serializeImportPC_args.output.data);
      const expectedSerializedUTXOSet = buffer; // Replace with expected serialized UTXOSet
      const expectedSerializedArgs = JSON.stringify(
        [expectedSerializedUTXOSet, ...args.slice(1)],
        null,
        2
      );
      expect(result).toBe(expectedSerializedArgs);
      expect(mockUTXOSet.serialize).toHaveBeenCalledWith('hex');
    });
  });

  describe('deserializeExportCP_args Testcases', () => {
    test('should deserialize arguments with all provided values', () => {
      const result = deserializeExportCP_args(fixtures.deserializeExportCP_args.allValues.input);
      for (let i = 0; i < result.length; i++) {
        expect(
          compareValues(
            covertBNToSting(result[i]),
            covertBNToSting(fixtures.deserializeExportCP_args.allValues.output[i])
          )
        ).toBe(true);
      }
    });
    test('should deserialize arguments for zero  values', () => {
      // @ts-ignore
      const result = deserializeExportCP_args(fixtures.deserializeExportCP_args.zeroValues.input);
      for (let i = 0; i < result.length; i++) {
        expect(
          compareValues(
            covertBNToSting(result[i]),
            covertBNToSting(fixtures.deserializeExportCP_args.zeroValues.output[i])
          )
        ).toBe(true);
      }
    });
  });

  describe('saveUnsignedTxJson', () => {
    const fs = require('fs');
    const mockExistsSync = jest.spyOn(fs, 'existsSync');
    const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync');
    beforeEach(() => {
      mockExistsSync.mockClear();
      mockWriteFileSync.mockClear();
    });

    test('should save unsignedTxJson with new id', () => {
      const id = 'uniqueId123';
      mockExistsSync.mockReturnValueOnce(false); // Simulate file does not exist

      saveUnsignedTxJson(fixtures.saveUnsignedTxJson.input, id);

      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${id}.unsignedTx.json`
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${id}.unsignedTx.json`,
        expect.any(String)
      );
    });

    test('should throw error when attempting to save unsignedTxJson with existing id', () => {
      const id = 'existingId456';
      mockExistsSync.mockReturnValueOnce(true); // Simulate file already exists

      expect(() => saveUnsignedTxJson(fixtures.saveUnsignedTxJson.input, id)).toThrowError(
        `unsignedTx file ForDefiTxnFiles/UnsignedTxns/${id}.unsignedTx.json already exists`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${id}.unsignedTx.json`
      );
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('readUnsignedTxJson', () => {
    const fs = require('fs');
    const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
    beforeEach(() => {
      mockReadFileSync.mockClear();
    });
    test('should read existing unsignedTxJson file', () => {
      const mockSerializedData = JSON.stringify(fixtures.readUnsignedTxJson.output);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);

      const result = readUnsignedTxJson(fixtures.readUnsignedTxJson.input);

      expect(result).toEqual(fixtures.readUnsignedTxJson.output);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedTxJson.input}.unsignedTx.json`
      );
    });

    test('should throw error when attempting to read non-existing unsignedTxJson file', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => readUnsignedTxJson(fixtures.readUnsignedTxJson.input)).toThrowError(
        `File not found`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedTxJson.input}.unsignedTx.json`
      );
    });
  });

  describe('readSignedTxJson', () => {
    const fs = require('fs');
    const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
    const mockExistsSync = jest.spyOn(fs, 'existsSync');
    beforeEach(() => {
      mockReadFileSync.mockClear();
      mockExistsSync.mockClear();
    });

    test('should read existing signedTxJson file with signature', () => {
      const mockSerializedData = JSON.stringify(fixtures.readSignedTxJson.valid.output);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);
      mockExistsSync.mockReturnValueOnce(true);
      const result = readSignedTxJson(fixtures.readSignedTxJson.valid.input);

      expect(result).toEqual(fixtures.readSignedTxJson.valid.output);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedTxJson.valid.input}.signedTx.json`
      );
    });

    test('should throw error when attempting to read non-existing signedTxJson file', () => {
      mockExistsSync.mockReturnValueOnce(false);

      try {
        readSignedTxJson(fixtures.readSignedTxJson.valid.input);
        fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.message).toBe(
          `signedTx file ForDefiTxnFiles/SignedTxns/${fixtures.readSignedTxJson.valid.input}.signedTx.json does not exist`
        );
      }

      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedTxJson.valid.input}.signedTx.json`
      );
    });

    test('should throw error when attempting to read unsignedTxJson file (missing signature)', () => {
      const mockSerializedData = JSON.stringify(fixtures.readSignedTxJson.invalid.output);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);
      mockExistsSync.mockReturnValueOnce(true);

      expect(() => readSignedTxJson(fixtures.readSignedTxJson.invalid.input)).toThrowError(
        `unsignedTx file ForDefiTxnFiles/SignedTxns/${fixtures.readSignedTxJson.invalid.input}.signedTx.json does not contain signature`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedTxJson.invalid.input}.signedTx.json`
      );
    });
  });

  // withdrawal
  describe('saveUnsignedWithdrawalTx', () => {
    const fs = require('fs');
    const mockExistsSync = jest.spyOn(fs, 'existsSync');
    const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync');

    beforeEach(() => {
      mockExistsSync.mockClear();
      mockWriteFileSync.mockClear();
    });

    test('should save unsignedWithdrawalTx with a new id', () => {
      mockExistsSync.mockReturnValueOnce(false);

      saveUnsignedWithdrawalTx(
        fixtures.saveUnsignedWithdrawalTx.input.unsignedTx,
        fixtures.saveUnsignedWithdrawalTx.input.id
      );

      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.saveUnsignedWithdrawalTx.input.id}.unsignedTx.json`
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.saveUnsignedWithdrawalTx.input.id}.unsignedTx.json`,
        JSON.stringify(fixtures.saveUnsignedWithdrawalTx.input.unsignedTx, null, 2)
      );
    });

    test('should throw error when attempting to save unsignedWithdrawalTx with existing id', () => {
      mockExistsSync.mockReturnValueOnce(true);

      expect(() =>
        saveUnsignedWithdrawalTx(
          fixtures.saveUnsignedWithdrawalTx.input.unsignedTx,
          fixtures.saveUnsignedWithdrawalTx.input.id
        )
      ).toThrowError(
        `unsignedTx file ForDefiTxnFiles/UnsignedTxns/${fixtures.saveUnsignedWithdrawalTx.input.id}.unsignedTx.json already exists`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.saveUnsignedWithdrawalTx.input.id}.unsignedTx.json`
      );
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('readUnsignedWithdrawalTx', () => {
    const fs = require('fs');
    const mockExistsSync = jest.spyOn(fs, 'existsSync');
    const mockReadFileSync = jest.spyOn(fs, 'readFileSync');

    beforeEach(() => {
      mockExistsSync.mockClear();
      mockReadFileSync.mockClear();
    });

    test('should read existing unsignedWithdrawalTx file', () => {
      const mockSerializedData = JSON.stringify(fixtures.readUnsignedWithdrawalTx.output);
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);

      const result = readUnsignedWithdrawalTx(fixtures.readUnsignedWithdrawalTx.input);

      expect(result).toEqual(fixtures.readUnsignedWithdrawalTx.output);
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedWithdrawalTx.input}.unsignedTx.json`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedWithdrawalTx.input}.unsignedTx.json`
      );
    });
    test('should throw error when attempting to read non-existing unsignedWithdrawalTx file', () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => readUnsignedWithdrawalTx(fixtures.readUnsignedWithdrawalTx.input)).toThrowError(
        `unsignedTx file ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedWithdrawalTx.input}.unsignedTx.json does not exist`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/UnsignedTxns/${fixtures.readUnsignedWithdrawalTx.input}.unsignedTx.json`
      );
    });
  });

  describe('readSignedWithdrawalTx', () => {
    const fs = require('fs');
    const mockExistsSync = jest.spyOn(fs, 'existsSync');
    const mockReadFileSync = jest.spyOn(fs, 'readFileSync');

    beforeEach(() => {
      mockExistsSync.mockClear();
      mockReadFileSync.mockClear();
    });

    test('should read existing signedWithdrawalTx file with signature', () => {
      const mockSerializedData = JSON.stringify(fixtures.readSignedWithdrawalTx.validOutput);
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);

      const result = readSignedWithdrawalTx(fixtures.readSignedWithdrawalTx.input);

      expect(result).toEqual(fixtures.readSignedWithdrawalTx.validOutput);
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json`
      );
    });

    test('should throw error when attempting to read non-existing signedWithdrawalTx file', () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => readSignedWithdrawalTx(fixtures.readSignedWithdrawalTx.input)).toThrowError(
        `signedTx file ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json does not exist`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json`
      );
    });

    test('should throw error when attempting to read signedWithdrawalTx file without signature', () => {
      const mockSerializedData = JSON.stringify(fixtures.readSignedWithdrawalTx.invalidOutput);
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);

      expect(() => readSignedWithdrawalTx(fixtures.readSignedWithdrawalTx.input)).toThrowError(
        `unsignedTx file ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json does not contain signature`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `ForDefiTxnFiles/SignedTxns/${fixtures.readSignedWithdrawalTx.input}.signedTx.json`
      );
    });
  });

  // key and unsigned/signed transaction storage

  describe('initCtxJson Testcases', () => {
    const fs = require('fs');
    class MockContextFile {
      // Simulated data for ContextFile
      data: any;

      constructor(data: any) {
        this.data = data;
      }
    }
    const mockContextFile = {
      publicKey: 'public_key',
      network: 'test_network',
      flareAddress: 'flare_address',
      ethAddress: 'eth_address',
      vaultId: 'vault_id'
    };
    test('should initialize ctx.json with provided ContextFile', () => {
      // Mock fs.existsSync and fs.writeFileSync
      const existsSyncMock = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const writeFileSyncMock = jest.spyOn(fs, 'writeFileSync').mockImplementation();

      initCtxJson(mockContextFile);

      // Verify if the function called fs.writeFileSync with correct arguments
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        'ctx.json',
        JSON.stringify(mockContextFile, null, 2)
      );

      // Restore mock functions
      existsSyncMock.mockRestore();
      writeFileSyncMock.mockRestore();
    });

    test('should throw error when ctx.json already exists', () => {
      // Mock fs.existsSync
      const existsSyncMock = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Expect an error to be thrown
      expect(() => initCtxJson(mockContextFile)).toThrow('ctx.json already exists');

      // Restore mock function
      existsSyncMock.mockRestore();
    });
  });

  describe('waitFinalize3Factory', () => {
    const mockWeb3 = {
      eth: {
        getTransactionCount: jest.fn()
      }
    };

    const mockFunc = jest.fn();
    const address = '0xAddress';
    const delay = 1000; // Set the desired delay value
    const waitFinalize3 = waitFinalize3Factory(mockWeb3 as any);

    beforeEach(() => {
      mockFunc.mockClear();
      mockWeb3.eth.getTransactionCount.mockClear();
    });

    test('should resolve with result when transaction count changes', async () => {
      mockWeb3.eth.getTransactionCount.mockReturnValueOnce(0).mockReturnValueOnce(1);

      const result = await waitFinalize3(address, mockFunc, delay);

      expect(result).toBeUndefined();
      expect(mockFunc).toHaveBeenCalled();
    });

    test('should retry and eventually throw timeout error', async () => {
      const mockGetTransactionCount = jest.fn().mockResolvedValueOnce(1).mockResolvedValue(1); // Simulate no nonce change for all retries
      const mockWeb3 = {
        eth: {
          getTransactionCount: mockGetTransactionCount
        }
      };

      const waitFinalize = waitFinalize3Factory(mockWeb3);

      const address = '0x123abc';
      const func = jest.fn().mockResolvedValue('Result');

      jest.useFakeTimers();

      await expect(waitFinalize(address, func, -1, true)).rejects.toThrowError();

      expect(func).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    }, 1000000);
  });

  describe('addFlagForSentSignedTx', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should add a flag for a sent signed transaction', () => {
      const fs = require('fs');
      const id = fixtures.addFlagForSentSignedTx.mock.validId;
      const mockExistsSync = jest.spyOn(fs, 'existsSync');
      mockExistsSync.mockReturnValueOnce(true);
      const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
      const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync');
      mockReadFileSync.mockReturnValueOnce(fixtures.addFlagForSentSignedTx.mock.serialisedData);
      mockWriteFileSync.mockReturnValue({});
      addFlagForSentSignedTx(id);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );

      // Ensure that the flag was added
      const expectedTxObj = { isSentToChain: true };
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`,
        JSON.stringify(expectedTxObj),
        'utf8'
      );
    });

    test('should throw an error if the signedTx file does not exist', () => {
      const fs = require('fs');
      const id = fixtures.addFlagForSentSignedTx.mock.invalidId;
      const mockExistsSync = jest.spyOn(fs, 'existsSync');
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => addFlagForSentSignedTx(id)).toThrowError(
        `signedTx file ${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json does not exist`
      );

      expect(mockExistsSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('isAlreadySentToChain', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return true when the file exists and isSentToChain is true', () => {
      const fs = require('fs');
      const id = fixtures.isAlreadySentToChain.mock.validId;
      const mockExistsSync = jest.spyOn(fs, 'existsSync');
      mockExistsSync.mockReturnValueOnce(true);
      const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
      mockReadFileSync.mockReturnValueOnce(fixtures.isAlreadySentToChain.mock.sentSerialisedData);
      const result = isAlreadySentToChain(id);
      expect(mockExistsSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );
      expect(result).toBe(true);
    });

    test('should return false when the file exists and isSentToChain is false', () => {
      const fs = require('fs');
      const id = fixtures.isAlreadySentToChain.mock.validUnsentId;
      const mockExistsSync = jest.spyOn(fs, 'existsSync');
      mockExistsSync.mockReturnValueOnce(true);

      const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
      const mockSerializedData = fixtures.isAlreadySentToChain.mock.unsentSerialisedData;
      mockReadFileSync.mockReturnValueOnce(mockSerializedData);

      const result = isAlreadySentToChain(id);

      expect(mockExistsSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );
      expect(mockReadFileSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );

      expect(result).toBe(false);
    });

    test('should return false when the file does not exist', () => {
      const fs = require('fs');
      const id = fixtures.isAlreadySentToChain.mock.invalidid;
      const mockExistsSync = jest.spyOn(fs, 'existsSync');
      mockExistsSync.mockReturnValueOnce(false);

      const result = isAlreadySentToChain(id);

      expect(mockExistsSync).toHaveBeenCalledWith(
        `${forDefiDirectory}/${forDefiSignedTxnDirectory}/${id}.signedTx.json`
      );

      expect(result).toBe(false);
    });
  });
});
