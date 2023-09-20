import { ethers } from 'ethers';
import { Context } from '../interfaces';
import { rpcFromNetwork, pChainStakeMirrorContractFromNetwork, DelegatedAmount } from './constants';
import { integerToDecimal } from '../utils';
import  abi from "./pChainStakeMirrorABI.json"

// creates contract instance
const getContractInstance = async (
  contractAddress: string,
  contractABI: any,
  rpcUrl: string
): Promise<ethers.Contract> => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);
  return contract;
};

// creates pChainMirrorContract instance
const getPChainMirrorContractInstance = async (ctx: Context): Promise<ethers.Contract> => {
  const rpcUrl = rpcFromNetwork(ctx.config.hrp);
  const mirrorContractAddress = pChainStakeMirrorContractFromNetwork(ctx.config.hrp);
  const contractInstance = await getContractInstance(mirrorContractAddress, abi, rpcUrl);
  return contractInstance;
};

// fetches staked amount from the mirror contract
const fetchStakedAmount = async (ctx: Context) => {
  const pMirrorContract = await getPChainMirrorContractInstance(ctx);
  const stakedAmount = await pMirrorContract.stakesOf('0x220D9Fd0eD124daC000FA4fa6F05C83965d4B600');
  return stakedAmount[1].length == 0 ? 0 : parseInt(stakedAmount[1]);
};

// fetches current validator info
const fetchValidatorInfo = async (ctx: Context) => {
  const validator = await ctx.pchain.getCurrentValidators();
  return validator;
};

// fetches pending validator info
const fetchPendingValidatorInfo = async (ctx: Context) => {
  const pendingValidator = await ctx.pchain.getPendingValidators();
  return pendingValidator;
};

// fetches the delegation stake (from both current and pending validator) for the current user
const fetchDelegateStake = async (ctx: Context, validatorFunction: (ctx: Context) => {}) => {
  const validatorsInfo = await validatorFunction(ctx);
  const validatorData = (validatorsInfo as any)?.validators;
  let userStake = [];
  for (let i = 0; i < validatorData.length; i++) {
    for (let j = 0; j < (validatorData[i].delegators && validatorData[i].delegators?.length); j++) {
      if (
        validatorData[i].delegators[j] &&
        validatorData[i].delegators[j].rewardOwner.addresses.includes(ctx.pAddressBech32)
      ) {
        userStake.push({
          stakeAmount: parseInt(validatorData[i]?.delegators[j]?.stakeAmount),
          startTime: parseInt(validatorData[i]?.delegators[j]?.startTime),
          endTime: parseInt(validatorData[i]?.delegators[j]?.endTime)
        });
      }
    }
  }
  return userStake;
};

// calculates the total amount of delegation
const getTotalFromDelegation = (data: DelegatedAmount[]) => {
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    total += data[i].stakeAmount;
  }
  return total;
};

/**
 * @description returns the mirror fund details
 * @param ctx - context
 * @returns - total mirror funds and funds with start and end time
 */
export const fetchMirrorFunds = async (ctx: Context) => {
  const stakeFromMirrorContract = await fetchStakedAmount(ctx);
  const delegationToCurrentValidator = await fetchDelegateStake(ctx, fetchValidatorInfo);
  const delegationToPendingValidator = await fetchDelegateStake(ctx, fetchPendingValidatorInfo);
  const totalDelegatedAmount =
    getTotalFromDelegation(delegationToCurrentValidator) +
    getTotalFromDelegation(delegationToPendingValidator) +
    stakeFromMirrorContract;
  const totalInFLR = integerToDecimal(totalDelegatedAmount.toString(), 9);
  return {
    TotalAmount: totalInFLR,
    MirrorFunds: {
      ...delegationToCurrentValidator,
      ...delegationToPendingValidator
    }
  };
};
