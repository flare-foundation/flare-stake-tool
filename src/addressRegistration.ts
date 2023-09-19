import Web3 from "web3";
import fs from "fs"
import { RegisterAddressInterface, UnsignedTxJson } from "./interfaces";
import { SignatureRequest } from "@flarenetwork/flarejs/dist/common"
import { bech32 } from "bech32";
import { ethers } from "ethersV5";
import { ledgerSign } from "./ledger/sign";
import { colorCodes, getConfig } from "./constants"
import { NetworkConfig } from "./config";

type contractAbi = [
  {
    type: "function",
    stateMutability: "view",
    outputs: [{ type: "bytes20", name: "", internalType: "bytes20" }],
    name: "cAddressToPAddress",
    inputs: [{ type: "address", name: "", internalType: "address" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    outputs: [],
    name: "registerAddresses",
    inputs: [
      { type: "bytes", name: "_publicKey", internalType: "bytes" },
      { type: "bytes20", name: "_pAddress", internalType: "bytes20" },
      { type: "address", name: "_cAddress", internalType: "address" },
    ],
  },
];


export async function isAddressRegistered(ethAddressToCheck: string, network: string): Promise<boolean> {

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = getContractAddress(network)
  const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  const abi = JSON.parse(fs.readFileSync("./addressBinderAbi.json", "utf-8")) as contractAbi
  const contract = new web3.eth.Contract(abi, addressBinderContractAddress)

  const result = await contract.methods.cAddressToPAddress(ethAddressToCheck).call();

  if (result !== '0x0000000000000000000000000000000000000000') {
    console.log(`${colorCodes.greenColor}Address associated with key ${ethAddressToCheck}: ${result}${colorCodes.resetColor}`);
    return true;
  } else {
    console.log(`${colorCodes.redColor}No address found for key ${ethAddressToCheck}${colorCodes.resetColor}`);
    return false;
  }
}

// const privateKey = "0xa0d4304993bff4b3952bf2a6afedfd3a04dfc7803e7ef46bf8d7937d78916b8a"

//registerAddresses("0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c","P-costwo18atl0e95w5ym6t8u5yrjpz35vqqzxfzrrsnq8u","0x81779a06ead1afafe3e3e361cfe10e7119f68f61","costwo")

function getRpcUrl(network: string): string {
  const config: NetworkConfig = getConfig(network)
  return `${config.protocol}://${config.ip}/ext/bc/C/rpc`
}

function getContractAddress(network: string): string {
  return '0xCc8f7C3d04C7f60BC89fA4DCDC77D668183aa2ac'
}

export async function registerAddress(addressParams: RegisterAddressInterface) {
  const { publicKey, pAddress, cAddress, network, wallet, derivationPath } = addressParams

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = getContractAddress(network)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const abi = JSON.parse(fs.readFileSync("./addressBinderAbi.json", "utf-8")) as contractAbi
  const contract = new ethers.Contract(addressBinderContractAddress, abi, provider);

  const checksumAddress = ethers.utils.getAddress(cAddress);
  const nonce = await provider.getTransactionCount(checksumAddress);
  const config: NetworkConfig = getConfig(network)

  const pAddr = "0x" + Buffer.from(bech32.fromWords(bech32.decode(pAddress.slice(2)).words)).toString('hex');
  const publicKeyPrefixed = "0x" + publicKey
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
    const serializedSignedTx = ethers.utils.serializeTransaction(unsignedTx, "0x" + sign.signature)
    await contract.provider.sendTransaction(serializedSignedTx)
  }
}

// const config = getContext("costwo", "0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c")

// if (config.pAddressBech32 && config.cAddressHex) {
//   const myObject = {
//     publicKey: "0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c",
//     pAddress: config.pAddressBech32,
//     cAddress: config.cAddressHex,
//     network: "costwo",
//   };


// }

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