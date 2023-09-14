import { ethers } from 'ethers';
import { Context } from '../interfaces';
import { rpcFromNetwork, pChainStakeMirrorContractFromNetwork, stakeOfABI } from './constants';
const abi = require('./pChainStakeMirrorABI.json');

export const getContractInstance = async (
  contractAddress: string,
  contractABI: any,
  rpcUrl: string
): Promise<ethers.Contract> => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);
  return contract;
};

export const getPChainMirrorContractInstance = async (ctx: Context): Promise<ethers.Contract> => {
  const rpcUrl = rpcFromNetwork(ctx.config.hrp);
  const mirrorContractAddress = pChainStakeMirrorContractFromNetwork(ctx.config.hrp);
  const contractInstance = await getContractInstance(mirrorContractAddress, abi, rpcUrl);
  return contractInstance;
};

export const fetchStakedAmount = async (ctx: Context) => {
  const pMirrorContract = await getPChainMirrorContractInstance(ctx);
  const stakedAmount = pMirrorContract.stakesOf(ctx.cAddressHex);
  return stakedAmount;
};

export const fetchBalaceDetails = async (ctx: Context) => {
  const response = await ctx.pchain.getBalance(ctx.pAddressBech32 as string);
  const { balance, lockedStakeable, lockedNotStakeable } = response;
  return { balance, lockedStakeable, lockedNotStakeable }
};

export const fetchMirrorFunds = async (ctx: Context) => {
  const stakeFromMirrorContract = await fetchStakedAmount(ctx)
  const { balance, lockedStakeable, lockedNotStakeable } = await fetchBalaceDetails(ctx)
  // do a sum of all these and send out the data
}
