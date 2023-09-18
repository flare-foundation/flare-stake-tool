import Web3 from "web3";
import fs from "fs"
import { RegisterAddressInterface, UnsignedTxJson } from "./interfaces";
import { getContext } from "./constants";
import { VoidSigner, ethers } from "ethersV5";
import { UnsignedTx } from '@flarenetwork/flarejs/dist/apis/evm/tx';
const FLR = 1e9 // one FLR in nanoFLR
const MAX_TRANSCTION_FEE = FLR

type contractAbi = [
  {
    type: "function",
    stateMutability: "view",
    outputs: [
      {
        type: "address",
        name: "",
        internalType: "address",
      },
    ],
    name: "pAddressToCAddress",
    inputs: [
      {
        type: "bytes20",
        name: "",
        internalType: "bytes20",
      },
    ],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    outputs: [],
    name: "registerAddresses",
    inputs: [
      {
        type: "bytes",
        name: "_publicKey",
        internalType: "bytes",
      },
      {
        type: "bytes20",
        name: "_pAddress",
        internalType: "bytes20",
      },
      {
        type: "address",
        name: "_cAddress",
        internalType: "address",
      },
    ],
  },
];

export async function isAddressRegistered(ethAddressToCheck: string, network: string): Promise<boolean> {

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = getContractAddress()
  const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  const abi = JSON.parse(fs.readFileSync("./addressBinderAbi.json", "utf-8")) as contractAbi
  const contract = new web3.eth.Contract(abi, addressBinderContractAddress)
  const bytes20Key = web3.utils.padLeft(ethAddressToCheck, 40)

  const result = await contract.methods.pAddressToCAddress(bytes20Key).call();

  if (result !== '0x0000000000000000000000000000000000000000') {
    console.log(`Address associated with key ${bytes20Key}: ${result}`);
    return true;
  } else {
    console.log(`No address found for key ${bytes20Key}`);
    return false;
  }
}

// isAddressRegistered("0x6ec1e0d6d213a6c56def0a3ea9f537c6e2e1c5be","conton")

const privateKey = "0xa0d4304993bff4b3952bf2a6afedfd3a04dfc7803e7ef46bf8d7937d78916b8a"

export async function registerAddresses(addressParams: RegisterAddressInterface) {

  // const unsignedTx: UnsignedTxJson = buildUnsignedTx(addressParams)



  switch (addressParams.wallet) {
    case "ledger":
      console.log("It's a Ledger wallet.");
      break;
    case "publicKey":
      console.log("It's a Public Key wallet.");
      break;
    case "privateKey":
      console.log("It's a Private Key wallet (not recommended).");
      break;
    default:
      throw new Error("Incorrect wallet type passed")
  }
}

//registerAddresses("0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c","P-costwo18atl0e95w5ym6t8u5yrjpz35vqqzxfzrrsnq8u","0x81779a06ead1afafe3e3e361cfe10e7119f68f61","costwo")

function getRpcUrl(network: string): string {
  return 'https://coston2-api.flare.network/ext/bc/C/rpc'
}

function getContractAddress(): string {
  return '0xCc8f7C3d04C7f60BC89fA4DCDC77D668183aa2ac'
}

async function buildUnsignedTx(addressParams: RegisterAddressInterface) {
  const { publicKey, pAddress, cAddress, network, wallet, derivationPath } = addressParams

  const rpcUrl = getRpcUrl(network)
  const addressBinderContractAddress = getContractAddress()
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  // console.log("provider",provider)

  const abi = JSON.parse(fs.readFileSync("./addressBinderAbi.json", "utf-8")) as contractAbi

  // const unsignedTx = await contract.populateTransaction.registerAddresses(publicKey, pAddress, cAddress)
  // console.log("tx",unsignedTx)
  // const serializedUnsignedTx = ethers.utils.serializeTransaction(unsignedTx);
  // const txHash = ethers.utils.keccak256(serializedUnsignedTx);

  const contract = new ethers.Contract(addressBinderContractAddress, abi, provider);

  try {
    // const functionName = 'registerAddress';
    // const functionArgs = [publicKey, pAddress, cAddress];
    // const data = contract.interface.encodeFunctionData( ...functionArgs);
    const checksumAddress = ethers.utils.getAddress("0x81779a06ead1afafe3e3e361cfe10e7119f68f61");
    const nonce = await provider.getTransactionCount(checksumAddress);
    const tx = {
      to: addressBinderContractAddress,
      // data: data,
      nonce: nonce,
    };
    // console.log("paddress",ethers.utils.hexZeroPad(ethers.utils.hexlify(pAddress), 20))
    const bytes32String = ethers.utils.formatBytes32String(pAddress);
    console.log(bytes32String)
    const populatedTx = await contract.populateTransaction.registerAddresses(publicKey, bytes32String, cAddress);
    console.log(populatedTx)
  } catch (error) {
    console.error('Error generating populated transaction:', error);
  }
}

const config = getContext("costwo", "0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c")

if (config.pAddressBech32 && config.cAddressHex) {
  const myObject = {
    publicKey: "0x03a0bfbf41b05f074b232aef045aa77a9272ebfb1cd5dd93ad7a5a6567197c382c",
    pAddress: config.pAddressBech32,
    cAddress: config.cAddressHex,
    network: "costwo",
    wallet: ""
  };

  buildUnsignedTx(myObject)
}
