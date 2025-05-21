export interface EthAddress {
  publicKey: string;
  address: string;
  chainCode?: string;
}

export interface Signature {
  r: string;
  s: string;
  v: number | string;
}