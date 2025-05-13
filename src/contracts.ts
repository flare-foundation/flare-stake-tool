import fs from "fs";
import { BigNumber, ethers } from "ethersV5";
import {
  forDefiDirectory,
  forDefiUnsignedTxnDirectory,
} from "./constants/forDefi";
import {
  getFlareContractRegistryABI,
  defaultContractAddresses,
  getPChainStakeMirrorABI,
  pChainStakeMirror,
} from "./constants/contracts";
import {
  rpcUrlFromNetworkConfig,
} from "./context";
import { Context } from "./interfaces";
import { pvm } from "@flarenetwork/flarejs";
import * as settings from './settings'
import { integerToDecimal } from "./utils";

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

  const abi = getFlareContractRegistryABI() as ethers.ContractInterface;
  if (network != "flare" && network != "costwo" && network != "coston" && network != "songbird")
    throw new Error("Invalid network passed");
  const contract = new ethers.Contract(
    defaultContractAddresses.FlareContractRegistry[network],
    abi,
    provider,
  );

  const result = await contract.getContractAddressByName(contractName);

  if (result !== "0x0000000000000000000000000000000000000000") return result;

  const defaultAddress = defaultContractAddresses[contractName]?.[network];
  if (defaultAddress) return defaultAddress;

  throw new Error("Contract Address not found");
}

function readUnsignedEVMObject(id: string): ethers.utils.UnsignedTransaction {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedEVMObject.json`;
  if (!fs.existsSync(fname)) {
    throw new Error(`unsigned EVM Object file ${fname} does not exist`);
  }
  const serialization = fs.readFileSync(fname).toString();
  let file = JSON.parse(serialization);
  file.gasPrice = BigNumber.from(file.gasPrice.hex);
  file.gasLimit = BigNumber.from(file.gasLimit.hex);
  return file as ethers.utils.UnsignedTransaction;
}

////////// MIRROR FUND /////////
// fetches current validator info
const fetchValidatorInfo = async (ctx: Context) => {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const validator = await pvmapi.getCurrentValidators()
  return validator;
};

// fetches pending validator info
const fetchPendingValidatorInfo = async (ctx: Context) => {
  const pvmapi = new pvm.PVMApi(settings.URL[ctx.config.hrp])
  const pendingValidator = await pvmapi.getPendingValidators()
  return pendingValidator;
};

// fetches the delegation stake (from both current and pending validator) for the current user
const fetchDelegateStake = async (
  ctx: Context,
  validatorFunction: (ctx: Context) => {},
) => {
  const validatorsInfo = await validatorFunction(ctx);
  const validatorData = (validatorsInfo as any)?.validators;
  let userStake = [];
  for (let i = 0; i < validatorData.length; i++) {
    for (
      let j = 0;
      j < (validatorData[i].delegators && validatorData[i].delegators?.length);
      j++
    ) {
      if (
        validatorData[i].delegators[j] &&
        validatorData[i].delegators[j].rewardOwner.addresses.includes(
          ctx.pAddressBech32,
        )
      ) {
        const startDate = new Date(
          parseInt(validatorData[i]?.delegators[j]?.startTime) * 1000,
        );
        const endDate = new Date(
          parseInt(validatorData[i]?.delegators[j]?.endTime) * 1000,
        );
        userStake.push({
          nodeID: validatorData[i]?.nodeID,
          stakeAmount:
            parseFloat(validatorData[i]?.delegators[j]?.stakeAmount) / 1e9,
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
  const rpcUrl = rpcUrlFromNetworkConfig(ctx.config.hrp);
  const pChainStakeMirrorContractAddress = await getContractAddress(
    ctx.config.hrp,
    pChainStakeMirror,
  );
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const abi = getPChainStakeMirrorABI() as ethers.ContractInterface;
  const contract = new ethers.Contract(
    pChainStakeMirrorContractAddress,
    abi,
    provider,
  );
  const stakedAmount = await contract.balanceOf(ctx.cAddressHex);
  const stakedAmountInFLR = parseFloat(
    integerToDecimal(stakedAmount.toString(), 18),
  );
  // fetch for the chain
  const delegationToCurrentValidator = await fetchDelegateStake(
    ctx,
    fetchValidatorInfo,
  );
  const delegationToPendingValidator = await fetchDelegateStake(
    ctx,
    fetchPendingValidatorInfo,
  );
  const totalDelegatedAmount =
    getTotalFromDelegation(delegationToCurrentValidator) +
    getTotalFromDelegation(delegationToPendingValidator);
  const totalInFLR = parseFloat(totalDelegatedAmount.toString());
  return {
    "Total Mirrored Amount": `${totalInFLR} FLR`,
    "Mirror Funds Details": [
      ...delegationToCurrentValidator,
      ...delegationToPendingValidator,
    ],
  };
}
