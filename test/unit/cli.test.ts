import {
  contextFromOptions,
  networkFromOptions,
  getOptions,
  capFeeAt,
  logAddressInfo,
  logBalanceInfo,
  logNetworkInfo,
  logValidatorInfo,
  initCtxJsonFromOptions
} from '../../src/cli';
import { logInfo, log } from '../../src/output';
import { contextEnv } from '../../src/context';
import { Context } from '../../src/interfaces';
import fixtures from '../fixtures/cli.data';
jest.mock('../../src/output', () => ({
  logInfo: jest.fn(),
  log: jest.fn()
}));

describe('cli testcases', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('contextFromOptions Testcases', () => {
    describe('context with ledger', () => {
      test('Should return context', async () => {
        const ledger = require('../../src/ledger/key');
        const spy = jest.spyOn(ledger, 'ledgerGetAccount');
        spy.mockReturnValue({ publicKey: fixtures.contextFromOptions.mock.ledger.publickey });
        const context = await contextFromOptions({ ledger: true });
        expect(context).not.toBeNull
      });

      test('Should return undefined for publickey when public is not found', async () => {
        const ledger = require('../../src/ledger/key');
        const spy = jest.spyOn(ledger, 'ledgerGetAccount');
        spy.mockReturnValue({ });
        const context = await contextFromOptions({ ledger: true });
        expect(context).not.toBeNull
        expect(context.publicKey).toBeUndefined
      });
    });

    test("Should return context for env option", async() => {
      const context = await contextFromOptions(fixtures.contextFromOptions.input.env)
      expect(context).not.toBeNull
    })

    test("Should return context for context file option", async() => {
      const context = await contextFromOptions(fixtures.contextFromOptions.input.ctx)
      expect(context).not.toBeNull
    })
  });
  describe('networkFromOptions Testcases', () => {
    test('should return flare', () => {
      const result = networkFromOptions(fixtures.networkFromOptions.flare.input);
      expect(result).toBe(fixtures.networkFromOptions.flare.output);
      expect(logInfo).toHaveBeenCalledWith(
        `Using network: ${fixtures.networkFromOptions.flare.output}`
      );
    });

    test('should return flare for null input', () => {
      const result = networkFromOptions(fixtures.networkFromOptions.null.input);
      expect(result).toBe(fixtures.networkFromOptions.null.output);
      expect(logInfo).toHaveBeenCalledWith(
        `Using network: ${fixtures.networkFromOptions.null.output}`
      );
    });
  });

  describe('getOptions Testcases', () => {
    test('merges program and options', () => {
      const program = { opts: () => ({ prop1: 'value1' }) };
      const options = { prop2: 'value2' };

      const result = getOptions(program as any, options);
      expect(result).toEqual({ prop1: 'value1', prop2: 'value2', network: 'flare' });
    });
    test('converts amount and fee to nanoFLR(whole number separated by ,)', () => {
      const program = { opts: () => ({}) };
      const options = { amount: '1,000,000', fee: '1' };

      const result = getOptions(program as any, options);
      expect(result).toEqual({ amount: '1000000000000000', fee: '1000000000', network: 'flare' });
    });

    test('converts amount and fee to nanoFLR(whole number)', () => {
      const program = { opts: () => ({}) };
      const options = { amount: '1000000', fee: '1' };

      const result = getOptions(program as any, options);
      expect(result).toEqual({ amount: '1000000000000000', fee: '1000000000', network: 'flare' });
    });
  });

  describe('capFeeAt Testcases', () => {
    test('does not throw when usedFee is not greater than cap', () => {
      const cap = 100;
      const usedFee = '50';
      const specifiedFee = '50000000';

      expect(() => capFeeAt(cap, "flare", usedFee, specifiedFee)).not.toThrow();
      expect(logInfo).toHaveBeenCalledWith(`Using fee of 5e-8 FLR`);
    });

    test('does not throw when usedFee is not greater than cap', () => {
      const cap = 100;
      const usedFee = '50000000';
      const specifiedFee = '50000000';

      capFeeAt(cap, "flare", usedFee, specifiedFee);
      expect(logInfo).not.toHaveBeenCalled();
    });

    test('throws when usedFee is greater than cap', () => {
      const cap = 100; // Example cap
      const usedFee = '15000000'; // 150 FLR in nanoFLR
      const specifiedFee = '150000000'; // 150 FLR in nanoFLR

      expect(() => capFeeAt(cap, "flare", usedFee, specifiedFee)).toThrowError(
        `Used fee of 0.015 FLR is higher than the maximum allowed fee of 1e-7 FLR`
      );
      expect(logInfo).not.toHaveBeenCalled();
    });
  });

  describe('logAddressInfo Testcases', () => {
    let ctx: Context = contextEnv('.env', 'localflare');
    test('log address info with provided ctx', () => {
      logAddressInfo(ctx);
      expect(logInfo).toHaveBeenCalledWith(
        `Addresses on the network "${fixtures.logAddressInfo.network}"`
      );
      expect(log).toHaveBeenCalledWith(`P-chain address: ${fixtures.logAddressInfo.pchainAddress}`);
      expect(log).toHaveBeenCalledWith(
        `C-chain address hex: ${fixtures.logAddressInfo.cchainAddress}`
      );
      expect(log).toHaveBeenCalledWith(
        `secp256k1 public key: ${fixtures.logAddressInfo.secp256k1PublicKey}`
      );
    });
  });

  describe('logBalanceInfo Testcases', () => {
    let ctx: Context = contextEnv('.env', 'localflare');
    test('should log balance info', async () => {
      await logBalanceInfo(ctx);
      expect(logInfo).toHaveBeenCalledWith(`Balances on the network "localflare"`);
      expect(log).toHaveBeenCalledTimes(2);
    });
  });

  describe('logNetworkInfo Testcases', () => {
    let ctx: Context = contextEnv('.env', 'localflare');
    test('should log network info', async () => {
      await logNetworkInfo(ctx);
      expect(logInfo).toHaveBeenCalledWith(`Information about the network "localflare\"`);
      expect(log).toHaveBeenCalledTimes(3);
    });
  });

  describe('logValidatorInfo Testcases', () => {
    let ctx: Context = contextEnv('.env', 'localflare');
    test('should log validator info', async () => {
      await logValidatorInfo(ctx);
      expect(logInfo).toHaveBeenCalledWith(`Validators on the network "localflare\"`);
      expect(log).toHaveBeenCalledTimes(2);
    });
  });
});
