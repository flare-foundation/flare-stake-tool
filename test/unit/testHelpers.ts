import { BN } from '@flarenetwork/flarejs/dist';
export const serialize = (bufferData: Buffer[]) => {
  const serializedData = JSON.stringify(bufferData, (key, value) => {
    if (Buffer.isBuffer(value)) {
      return { data: Array.from(value), type: 'Buffer' };
    }
    return value;
  });

  return serializedData;
};

export const covertBNToSting = (data: any): string => {
  return data instanceof BN ? data.toString() : data;
};

export const convertArrayBNToString = (arr: any[]): any[] => {
  return arr.map((item) => (item instanceof BN ? item.toString() : item));
};

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
