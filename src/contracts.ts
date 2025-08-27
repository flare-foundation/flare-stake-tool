import { ethers } from "ethersV5";
import {
  getFlareContractRegistryABI,
  defaultContractAddresses,
  getPChainStakeMirrorABI,
  pChainStakeMirror,
  flareContractRegistryABI,
} from "./constants/contracts";
import {
  rpcUrlFromNetworkConfig,
} from "./context";
import { Context } from "./interfaces";
import { pvm } from "@flarenetwork/flarejs";
import * as settings from './settings'
import { integerToDecimal } from "./utils";
import { zeroAddress } from "ethereumjs-util";
import { GetCurrentValidatorsResponse } from "@flarenetwork/flarejs/dist/vms/pvm";

type DelegationInfo = {
  nodeID: string;
  stakeAmount: number,
  startTime: Date,
  endTime: Date
}

async function getContractAddress(
  network: string,
  contractName: string,
): Promise<string> {
  const rpcUrl = rpcUrlFromNetworkConfig(network);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  if (network != "flare" && network != "costwo" && network != "songbird" && network != "coston") {
    throw new Error("Invalid network passed");
  }
  const contract = new ethers.Contract(
    defaultContractAddresses.FlareContractRegistry[network],
    flareContractRegistryABI,
    provider,
  );

  const result = await (contract.getContractAddressByName as (name: string) => Promise<string>)(contractName);
  if (result !== zeroAddress()) return result;

  const defaultAddress = defaultContractAddresses[contractName]?.[network];
  if (defaultAddress) return defaultAddress;

  throw new Error("Contract Address not found");
}


////////// MIRROR FUND /////////
// fetches current validator info
const fetchValidatorInfo = async (ctx: Context) => {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const validator = await pvmapi.getCurrentValidators()
  return validator;
};

// fetches the delegation stake (from both current validator) for the current user
const fetchDelegateStake = async (
  ctx: Context,
  validatorFunction: (ctx: Context) => any,
) => {
  const validatorsInfo = await validatorFunction(ctx) as GetCurrentValidatorsResponseFixed;
  const validatorsData = validatorsInfo.validators;
  let userStake = [];
  if (!ctx.pAddressBech32) {
    throw new Error("pAddressBech32 is not set in the context");
  }
  for (let i = 0; i < validatorsData.length; i++) {
    const validatorData = validatorsData[i];
    // get validators
    if (validatorData.validationRewardOwner && validatorData.validationRewardOwner.addresses.includes(ctx.pAddressBech32)) {
      const startDate = new Date(
        parseInt(validatorData.startTime) * 1000,
      );
      const endDate = new Date(
        parseInt(validatorData.endTime) * 1000,
      );
      userStake.push({
        type: "validator",
        nodeID: validatorData.nodeID,
        stakeAmount:
          parseFloat(validatorData.stakeAmount) / 1e9,
        startTime: startDate,
        endTime: endDate,
      });
    }

    // get delegators
    for (let j = 0; j < (validatorData.delegators && validatorData.delegators?.length); j++) {
      if (validatorData.delegators[j] &&
        validatorData.delegators[j].rewardOwner.addresses.includes(ctx.pAddressBech32)
      ) {
        const startDate = new Date(
          parseInt(validatorData.delegators[j].startTime) * 1000,
        );
        const endDate = new Date(
          parseInt(validatorData.delegators[j].endTime) * 1000,
        );
        userStake.push({
          type: "delegator",
          nodeID: validatorData.nodeID,
          stakeAmount:
            parseFloat(validatorData.delegators[j].stakeAmount) / 1e9,
          startTime: startDate,
          endTime: endDate,
        });
      }
    }
  }
  return userStake;
};

// calculates the total amount of delegation
const getTotalFromDelegation = (data: DelegationInfo[]) => {
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
export async function fetchMirrorFunds(ctx: Context) {
  // fetch from the contract
  // TODO: implement from contract (mirrored) and split to two (mirrored and directly from p-chai
  // const rpcUrl = rpcUrlFromNetworkConfig(ctx.config.hrp);
  // const pChainStakeMirrorContractAddress = await getContractAddress(
  //   ctx.config.hrp,
  //   pChainStakeMirror,
  // );
  // const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  // const abi = getPChainStakeMirrorABI() as ethers.ContractInterface;
  // const contract = new ethers.Contract(
  //   pChainStakeMirrorContractAddress,
  //   abi,
  //   provider,
  // );
  // const stakedAmount = await contract.balanceOf(ctx.cAddressHex);
  // const stakedAmountInFLR = parseFloat(
  //   integerToDecimal(stakedAmount.toString(), 18),
  // );
  // fetch from the chain
  const delegationToCurrentValidator = await fetchDelegateStake(
    ctx,
    fetchValidatorInfo,
  );
  const totalDelegatedAmount = getTotalFromDelegation(delegationToCurrentValidator);

  const totalInFLR = parseFloat(totalDelegatedAmount.toString());
  return {
    "Total Mirrored Amount": `${totalInFLR} FLR`,
    "Mirror Funds Details": delegationToCurrentValidator
  };
}


export type GetCurrentValidatorsResponseFixed = {
  validators: {
    accruedDelegateeReward: string;
    txID: string;
    startTime: string;
    endTime: string;
    stakeAmount: string;
    nodeID: string;
    weight: string;
    rewardOwner: {
      locktime: string;
      threshold: string;
      addresses: string[];
    };
    validationRewardOwner: {
      locktime: string;
      threshold: string;
      addresses: string[];
    };
    delegationRewardOwner: {
      locktime: string;
      threshold: string;
      addresses: string[];
    };
    delegatorCount: string;
    delegatorWeight: string;
    potentialReward: string;
    delegationFee: string;
    uptime: string;
    connected: boolean;
    delegators: {
      txID: string;
      startTime: string;
      endTime: string;
      stakeAmount: string;
      nodeID: string;
      rewardOwner: {
        locktime: string;
        threshold: string;
        addresses: string[];
      };
      potentialReward: string;
    }[];
  }[];
}