import { ClaimRewardsInterface, RegisterAddressInterface, UnsignedTxJson } from "./interfaces";
import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"
import { bech32 } from "bech32";
import { BigNumber, ethers } from "ethersV5";
import { ledgerSign } from "./ledger/sign";
import fs from 'fs'
import { colorCodes, getConfig, forDefiDirectory, forDefiUnsignedTxnDirectory } from "./constants"
import { NetworkConfig } from "./config";
import {
  getAddressBinderABI, getFlareContractRegistryABI, defaultContractAddresses, addressBinderContractName,
  validatorRewardManagerContractName, contractTransactionName, getValidatorRewardManagerABI
} from "./flareContractConstants";
import { prefix0x, saveUnsignedTxJson } from "./utils";
import { walletConstants } from "./screenConstants";
import { exit } from "process";

/**
 * @description checks if the address is registered with the addressBinder contract
 * @param ethAddressToCheck
 * @param network
 */
export async function isAddressRegistered(ethAddressToCheck: string, network: string): Promise<boolean> {

  console.log("Checking Address Registration...")
  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = await getContractAddress(network, addressBinderContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getAddressBinderABI() as ethers.ContractInterface
  const contract = new ethers.Contract(addressBinderContractAddress, abi, provider);

  const result = await contract.cAddressToPAddress(ethAddressToCheck);
  const pChainAddress = bech32.encode(network, bech32.toWords(Buffer.from(result.slice(2), 'hex')))

  if (result !== '0x0000000000000000000000000000000000000000') {
    console.log(`${colorCodes.greenColor}Address associated with key ${ethAddressToCheck}: ${pChainAddress}${colorCodes.resetColor}`);
    return true;
  } else {
    console.log(`${colorCodes.redColor}No address found for key ${ethAddressToCheck}${colorCodes.resetColor}`);
    return false;
  }
}

/**
 * @description checks if there are any unclaimed rewards with the validatorRewardManager contract
 * @param ethAddressToCheck
 * @param network
 */
export async function isUnclaimedReward(ethAddressToCheck: string, network: string): Promise<boolean> {

  console.log("Checking your Rewards status...")
  const rpcUrl = getRpcUrl(network)
  const validatorRewardManagerContractAddress = await getContractAddress(network, validatorRewardManagerContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getValidatorRewardManagerABI() as ethers.ContractInterface
  const contract = new ethers.Contract(validatorRewardManagerContractAddress, abi, provider);

  const rewards = await contract.getStateOfRewards(ethAddressToCheck);

  const totalRewardNumber: BigNumber = rewards[0]
    const claimedRewardNumber: BigNumber = rewards[1]
  const unclaimedRewards: BigNumber = totalRewardNumber.sub(claimedRewardNumber)

  if (unclaimedRewards.gt(BigNumber.from("0"))) {
    const unclaimedRewardsInFLR: BigNumber = unclaimedRewards.div(ethers.constants.WeiPerEther) // div by 1e18
    console.log(`${colorCodes.greenColor}You have unclaimed rewards worth ${unclaimedRewardsInFLR} FLR${colorCodes.resetColor}`);
    return true;
  } else {
    console.log(`${colorCodes.redColor}No unclaimed rewards found ${colorCodes.resetColor}`);
    return false;
  }
}

/**
 * @description cregisters address  with the addressBinder contract
 * @param {RegisterAddressInterface} addressParams
 */
export async function registerAddress(addressParams: RegisterAddressInterface) {
  const { publicKey, pAddress, cAddress, network, wallet, derivationPath, pvtKey, transactionId } = addressParams

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = await getContractAddress(network, addressBinderContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getAddressBinderABI() as ethers.ContractInterface
  const contract = new ethers.Contract(addressBinderContractAddress, abi, provider);

  const checksumAddress = ethers.utils.getAddress(cAddress);
  const nonce = await provider.getTransactionCount(checksumAddress);
  const config: NetworkConfig = getConfig(network)

  const pAddr = prefix0x(Buffer.from(bech32.fromWords(bech32.decode(pAddress.slice(2)).words)).toString('hex'));
  const publicKeyPrefixed = prefix0x(publicKey)
  const gasEstimate = await contract.estimateGas.registerAddresses(publicKeyPrefixed, pAddr, cAddress, { from: cAddress });
  const gasPrice = await provider.getGasPrice();

  const populatedTx = await contract.populateTransaction.registerAddresses(publicKeyPrefixed, pAddr, cAddress);
  const unsignedTx = {
    ...populatedTx,
    nonce,
    chainId: config.networkID,
    gasPrice,
    gasLimit: gasEstimate
  }

  await signContractTransaction(wallet, unsignedTx, contract, derivationPath, transactionId, pvtKey)

}

/**
 * @description claims rewards from the ValidatorRewardManager Contract
 * @param {ClaimRewardsInterface} rewardsParams
 */
export async function claimRewards(rewardsParams: ClaimRewardsInterface) {
  const { claimAmount, ownerAddress, receiverAddress, network, wallet, derivationPath, pvtKey, transactionId } = rewardsParams

  const rewardAmount: BigNumber = BigNumber.from(claimAmount).mul(ethers.constants.WeiPerEther)
  if (rewardAmount.gt(await getUnclaimedRewards(ownerAddress, network)) || !rewardAmount.gt(BigNumber.from("0"))) {
    throw new Error("Incorrect amount to claim")
  }

  const rpcUrl = getRpcUrl(network)
  const validatorRewardManagerContractAddress = await getContractAddress(network, validatorRewardManagerContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getValidatorRewardManagerABI() as ethers.ContractInterface
  const contract = new ethers.Contract(validatorRewardManagerContractAddress, abi, provider);

  const checksumAddress = ethers.utils.getAddress(ownerAddress);
  const nonce = await provider.getTransactionCount(checksumAddress);
  const config: NetworkConfig = getConfig(network)

  let gasEstimate
  try {
        gasEstimate = await contract.estimateGas.claim(ownerAddress, prefix0x(receiverAddress), rewardAmount, false, { from: ownerAddress })
  } catch {
    console.log(`${colorCodes.redColor}Incorrect arguments passed${colorCodes.resetColor}`)
    exit()
  }

  const gasPrice = await provider.getGasPrice();

  const populatedTx = await contract.populateTransaction.claim(ownerAddress, prefix0x(receiverAddress), rewardAmount, false)
  const unsignedTx = {
    ...populatedTx,
    nonce,
    chainId: config.networkID,
    gasPrice,
    gasLimit: gasEstimate
  }

  await signContractTransaction(wallet, unsignedTx, contract, derivationPath, transactionId, pvtKey)
}


/**
 * @description submits signed ForDefi txn to the chain
 * @param id Id of the txn to submit
 * @param signature signature of the signed txn from ForDefi
 * @param network
 * @returns TxnHash
 */
export async function submitForDefiTxn(id: string, signature: string, network: string): Promise<string> {
  const provider = new ethers.providers.JsonRpcProvider(getRpcUrl(network));
  const serializedSignedTx = ethers.utils.serializeTransaction(readUnsignedEVMObject(id), prefix0x(signature))
  const chainId = await provider.sendTransaction(serializedSignedTx)
  return chainId.hash
}

function createUnsignedJsonObject(txHash: string): UnsignedTxJson {

  const signatureRequest: SignatureRequest = {
    message: txHash.slice(2),
    signer: "",
  };

  const unsignedTxJson: UnsignedTxJson = {
    transactionType: contractTransactionName,
    serialization: "",
    signatureRequests: [signatureRequest],
    unsignedTransactionBuffer: "",
    usedFee: "",
    txDetails: "",
  };

  return unsignedTxJson;
}

/**
 * @param network
 * @returns {string} The RPC url of the given network
 */
export function getRpcUrl(network: string): string {
  const config: NetworkConfig = getConfig(network)
  return `${config.protocol}://${config.ip}/ext/bc/C/rpc`
}

async function getContractAddress(network: string, contractName: string): Promise<string> {
  const rpcUrl = getRpcUrl(network)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getFlareContractRegistryABI() as ethers.ContractInterface
  if (network != "flare" && network != "costwo") throw new Error("Invalid network passed")
  const contract = new ethers.Contract(defaultContractAddresses.flareContractRegistryAddress[network], abi, provider);

  const result = await contract.getContractAddressByName(contractName);

  if (result !== '0x0000000000000000000000000000000000000000') return result

  const defaultAddress = defaultContractAddresses[contractName]?.[network]
  if (defaultAddress) return defaultAddress

  throw new Error("Contract Address not found")

}

function readUnsignedEVMObject(id: string): ethers.utils.UnsignedTransaction {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedEVMObject.json`
  if (!fs.existsSync(fname)) {
    throw new Error(`unsigned EVM Object file ${fname} does not exist`)
  }
  const serialization = fs.readFileSync(fname).toString()
  let file = JSON.parse(serialization)
  file.gasPrice = BigNumber.from(file.gasPrice.hex)
  file.gasLimit = BigNumber.from(file.gasLimit.hex)
  return file as ethers.utils.UnsignedTransaction
}

function saveUnsignedEVMObject(unsignedTx: Object, id: string): void {
  const fname = `${forDefiDirectory}/${forDefiUnsignedTxnDirectory}/${id}.unsignedEVMObject.json`
  if (fs.existsSync(fname)) {
    throw new Error(`unsignedTx file ${fname} already exists`)
  }
  const serialization = JSON.stringify(unsignedTx, null, 2)
  fs.mkdirSync(`${forDefiDirectory}/${forDefiUnsignedTxnDirectory}`, { recursive: true })
  fs.writeFileSync(fname, serialization)
}

async function getUnclaimedRewards(ethAddress: string, network: string): Promise<BigNumber> {
  const rpcUrl = getRpcUrl(network)
  const validatorRewardManagerContractAddress = await getContractAddress(network, validatorRewardManagerContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getValidatorRewardManagerABI() as ethers.ContractInterface
  const contract = new ethers.Contract(validatorRewardManagerContractAddress, abi, provider);

  const rewards = await contract.getStateOfRewards(ethAddress);

  const totalRewardNumber: BigNumber = rewards[0]
  const claimedRewardNumber: BigNumber = rewards[1]
  const unclaimedRewards: BigNumber = totalRewardNumber.sub(claimedRewardNumber)
  return unclaimedRewards
}

async function signContractTransaction(wallet: keyof typeof walletConstants, unsignedTx: Object, contract: ethers.Contract, derivationPath?: string,
  transactionId?: string, pvtKey?: string) {
  const serializedUnsignedTx = ethers.utils.serializeTransaction(unsignedTx);
  const txHash = ethers.utils.keccak256(serializedUnsignedTx);
  const unsignedTxObj = createUnsignedJsonObject(txHash)

  if (wallet === Object.keys(walletConstants)[0]) {
    if (!derivationPath) throw new Error("No derivation path passed")
    const sign = await ledgerSign(unsignedTxObj, derivationPath)
    const serializedSignedTx = ethers.utils.serializeTransaction(unsignedTx, prefix0x(sign.signature))
    console.log("Submitting txn to the chain")
    await contract.provider.sendTransaction(serializedSignedTx)
  }
  else if (wallet === Object.keys(walletConstants)[1]) {
    if (!transactionId) throw new Error("No transaction Id passed")
    saveUnsignedTxJson(unsignedTxObj, transactionId)
    saveUnsignedEVMObject(unsignedTx, transactionId)
  }
  else if (wallet === Object.keys(walletConstants)[2]) {
    if (!pvtKey) throw new Error("No private key passed")
    const wallet = new ethers.Wallet(pvtKey);
    const signedTx = await wallet.signTransaction(unsignedTx)
    await contract.provider.sendTransaction(signedTx)
  }
}