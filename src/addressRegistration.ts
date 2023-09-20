import { RegisterAddressInterface, UnsignedTxJson } from "./interfaces";
import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"
import { bech32 } from "bech32";
import { ethers } from "ethersV5";
import { ledgerSign } from "./ledger/sign";
import { colorCodes, getConfig } from "./constants"
import { NetworkConfig } from "./config";
import { getAddressBinderABI, getFlareContractRegistryABI, defaultContractAddresses, addressBinderContractName, validatorRewardManagerContractName } from "./addressConstants";
import { prefix0x } from "./utils";

export async function isAddressRegistered(ethAddressToCheck: string, network: string): Promise<boolean> {

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = await getContractAddress(network, addressBinderContractName)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = getAddressBinderABI() as ethers.ContractInterface
  const contract = new ethers.Contract(addressBinderContractAddress, abi, provider);

  const result = await contract.cAddressToPAddress(ethAddressToCheck);

  if (result !== '0x0000000000000000000000000000000000000000') {
    console.log(`${colorCodes.greenColor}Address associated with key ${ethAddressToCheck}: ${result}${colorCodes.resetColor}`);
    return true;
  } else {
    console.log(`${colorCodes.redColor}No address found for key ${ethAddressToCheck}${colorCodes.resetColor}`);
    return false;
  }
}

export async function registerAddress(addressParams: RegisterAddressInterface) {
  const { publicKey, pAddress, cAddress, network, wallet, derivationPath, pvtKey } = addressParams

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
  const gasEstimate = await contract.estimateGas.registerAddresses(publicKeyPrefixed, pAddr, cAddress);
  const gasPrice = await provider.getGasPrice();

  const populatedTx = await contract.populateTransaction.registerAddresses(publicKeyPrefixed, pAddr, cAddress);
  const unsignedTx = {
    ...populatedTx,
    nonce,
    chainId: config.networkID,
    gasPrice,
    gasLimit: gasEstimate
  }

  const serializedUnsignedTx = ethers.utils.serializeTransaction(unsignedTx);
  const txHash = ethers.utils.keccak256(serializedUnsignedTx);
  const unsignedTxObj = createUnsignedJsonObject(txHash)

  if (wallet == "Ledger") {
    if (!derivationPath) throw new Error("No derivation path passed")
    const sign = await ledgerSign(unsignedTxObj, derivationPath)
    const serializedSignedTx = ethers.utils.serializeTransaction(unsignedTx, prefix0x(sign.signature))
    await contract.provider.sendTransaction(serializedSignedTx)
  }
  else if (wallet == "ForDefi") {

  }
  else if (wallet == "Private Key") {
    if (!pvtKey) throw new Error("No private key passed")
    const wallet = new ethers.Wallet(pvtKey);
    const signedTx = await wallet.signTransaction(unsignedTx)
    await contract.provider.sendTransaction(signedTx)
  }
}

function createUnsignedJsonObject(txHash: string): UnsignedTxJson {

  const signatureRequest: SignatureRequest = {
    message: txHash.slice(2),
    signer: "",
  };

  const unsignedTxJson: UnsignedTxJson = {
    transactionType: "",
    serialization: "",
    signatureRequests: [signatureRequest],
    unsignedTransactionBuffer: "",
    usedFee: "",
    txDetails: "",
    forDefiTxId: "",
    forDefiHash: "",
  };

  return unsignedTxJson;
}

function getRpcUrl(network: string): string {
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
