/**
 * Contract based info
 */
export const costwoPChainStakeMirrorContract = '0x3F65F2e9e25EdA1189c3aF3D596f1c2E71ececa9';
export const flarePChainStakeMirrorContract = '0x3F65F2e9e25EdA1189c3aF3D596f1c2E71ececa9';
/**
 * RPC based info
 */
export const flarePublicRPC = 'https://flare-api.flare.network/';
export const costwoPublicRPC = 'https://coston2-api.flare.network/ext/C/rpc';

export const pChainStakeMirrorContractFromNetwork = (network: string) => {
  if (network == 'costwo') {
    return costwoPChainStakeMirrorContract;
  } else if (network == 'flare') {
    return flarePChainStakeMirrorContract;
  } else {
    // for other case, return flare contract by default
    return flarePChainStakeMirrorContract;
  }
};

export const rpcFromNetwork = (network: string) => {
  if (network == 'costwo') {
    return costwoPublicRPC;
  } else if (network == 'flare') {
    return flarePublicRPC;
  } else {
    // for other case, return flare mainnet rpc by default
    return flarePublicRPC;
  }
};

export type DelegatedAmount = {
  stakeAmount: number,
  startTime: number,
  endTime: number
}