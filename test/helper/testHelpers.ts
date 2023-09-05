import { BN } from '@flarenetwork/flarejs/dist';
import { exportTxCP } from '../../src/evmAtomicTx';
import { contextEnv } from '../../src/constants';

/**
 * @description - serializes the buffer data
 * @param bufferData - buffer data
 * @returns returns serialised data
 */
export const serialize = (bufferData: Buffer[]) => {
  const serializedData = JSON.stringify(bufferData, (key, value) => {
    if (Buffer.isBuffer(value)) {
      return { data: Array.from(value), type: 'Buffer' };
    }
    return value;
  });

  return serializedData;
};

/**
 * @description: converts a data to big number
 * @param data - data of type any
 * @returns - returns it in big number format
 */
export const covertBNToSting = (data: any): string => {
  return data instanceof BN ? data.toString() : data;
};

/**
 * @description - converts an array of data to big integer
 * @param arr - array of entities
 * @returns - converts each to big number and returns the array
 */
export const convertArrayBNToString = (arr: any[]): any[] => {
  return arr.map((item) => (item instanceof BN ? item.toString() : item));
};

/**
 * @description - compares two big number
 * @param a - first big number
 * @param b - second big number
 * @returns - returns if both of them are equal or not
 */
export const compareValues = (a: any, b: any): boolean => {
  if (a == undefined && b == undefined) {
    return true;
  }
  if (a instanceof BN && b instanceof BN) {
    return a.toString() === b.toString();
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length == b.length) {
    for (let i = 0; i < a.length; i++) {
      if (!compareValues(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
};

/**
 * @description - transfers funds from C to P chain
 */
export const tranferFundsFromCtoP = async () => {
  try {
    let ctx = contextEnv('.env', 'localflare');
    await exportTxCP(ctx, new BN(100000));
  } catch (error) {
    console.log(error);
  }
};
