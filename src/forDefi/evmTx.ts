import { Transaction, TransactionLike, ZeroAddress, Wallet, ethers } from "ethers";
import { prefix0x, toHex, unPrefix0x } from "../utils"
import { saveUnsignedEvmTx, readSignedEvmTx, readUnsignedEvmTx, getWeb3Contract, waitFinalize } from './utils'
import { Context, UnsignedEvmTxJson } from '../interfaces';
import { claimSetupManagerABI, distributionToDelegatorsABI, flareContractRegistryABI, flareContractRegistryAddress, validatorRewardManagerABI } from "../constants/contracts";
import { logInfo } from "../output";
import * as ledger from '../ledger'
import Web3 from "web3";
import { networkTokenSymbol } from "../cli";
import chalk from "chalk";

/**
 * @description Creates the withdrawal transaction and stores unsigned trx object in the file id
 * @param ctx - context
 * @param toAddress - the to address
 * @param amount - amount to be withdrawn
 * @param fileId - file id
 * @param nonce - nonce
 * @returns returns the ForDefi hash of the transaction
 */
export async function createWithdrawalTransaction(ctx: Context, toAddress: string, amount: number, fileId: string, nonce: number): Promise<string> {
  const web3 = ctx.web3;
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }
  const txNonce = nonce ?? Number(await web3.eth.getTransactionCount(ctx.cAddressHex));

  const amountWei = BigInt(amount) * BigInt(10 ** 9) // amount is already in nanoFLR

  // check if address is valid
  web3.utils.toChecksumAddress(toAddress);

  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: toAddress,
    value: amountWei.toString(),
    chainId: ctx.config.chainID
  }

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }
  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}

/**
 * @description Creates the opt out transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param fileId - file id
 * @param nonce - nonce
 * @returns returns the ForDefi hash of the transaction
 */
export async function createOptOutTransaction(ctx: Context, fileId: string, nonce: number): Promise<string> {

  const web3 = ctx.web3;
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }

  const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
  const distributionToDelegatorsAddress: string = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("DistributionToDelegators").call();
  if (distributionToDelegatorsAddress == ZeroAddress) {
    throw new Error("Distribution contract address not found");
  }
  const txNonce = nonce ?? String(await ctx.web3.eth.getTransactionCount(ctx.cAddressHex));
  const distributionWeb3Contract = getWeb3Contract(ctx.web3, distributionToDelegatorsAddress, distributionToDelegatorsABI);
  const fnToEncode = distributionWeb3Contract.methods.optOutOfAirdrop();

  // check if address is already opt out candidate
  const isOptOutCandidate = await distributionWeb3Contract.methods.optOutCandidate(ctx.cAddressHex).call();
  if (isOptOutCandidate) {
    throw new Error("Already an opt out candidate");
  }

  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: distributionWeb3Contract.options.address,
    data: fnToEncode.encodeABI(),
    chainId: ctx.config.networkID
  }

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }
  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}

/**
 * @description Creates the unsigned claim (staking rewards) transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param fileId - file id
 * @param nonce - nonce
 * @param amount - amount to be claimed (in nanoFLR)
 * @param recipient - recipient address
 * @param wrap - whether to wrap the claimed amount
 * @returns returns the unsigned transaction object
 */
export async function createClaimTransaction(ctx: Context, amount: number, recipientAddress: string, wrap: boolean, nonce?: number): Promise<TransactionLike> {
  logInfo('Creating claim transaction...')

  const web3 = ctx.web3;
  const owner = ctx.cAddressHex;
  if (!owner) {
    throw new Error("cAddressHex not found in context");
  }

  // check if address is valid
  web3.utils.toChecksumAddress(recipientAddress);

  const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
  const validatorRewardManagerAddress: string = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("ValidatorRewardManager").call();
  if (validatorRewardManagerAddress == ZeroAddress) {
    throw new Error("ValidatorRewardManager contract address not found");
  }
  const txNonce = nonce ?? Number(await web3.eth.getTransactionCount(owner));
  const validatorRewardManagerContract = getWeb3Contract(web3, validatorRewardManagerAddress, validatorRewardManagerABI);

  // check if unclaimed rewards are available
  const rewardsState = await validatorRewardManagerContract.methods.getStateOfRewards(owner).call();
  if (!rewardsState) {
    throw new Error("Invalid rewards response");
  }
  const totalRewards = BigInt(rewardsState[0]);
  const claimedRewards = BigInt(rewardsState[1]);
  const unclaimedRewardsWei: bigint = totalRewards - claimedRewards;
  const amountWei = amount ? BigInt(amount) * BigInt(10 ** 9) : unclaimedRewardsWei // amount is already in nanoFLR
  const unclaimedRewards = ethers.formatUnits(unclaimedRewardsWei, 18); // convert to FLR

  if (amountWei > unclaimedRewardsWei || unclaimedRewardsWei === 0n || amountWei === 0n) {
    const symbol = networkTokenSymbol[ctx.config.hrp]
    throw new Error(`Trying to claim: ${ethers.formatUnits(amount, 9)} ${symbol}. Unclaimed rewards: ${unclaimedRewards} ${symbol}. Amount should be greater than 0 and less than or equal to unclaimed rewards.`);
  }

  const fnToEncode = validatorRewardManagerContract.methods.claim(
    owner,
    recipientAddress,
    amountWei,
    wrap
  );
  // const lastBlock = await web3.eth.getBlockNumber() - 3n;
  // let gasPrice: bigint;
  // try {
  //   const feeHistory = await web3.eth.getFeeHistory(50, lastBlock, [0]);
  //   const baseFee = feeHistory.baseFeePerGas as any as bigint[];
  //   // get max fee of the last 50 blocks
  //   let maxFee = 0n;
  //   for (const fee of baseFee) {
  //     if (fee > maxFee) {
  //       maxFee = fee;
  //     }
  //   }
  //   gasPrice = maxFee * 10n;
  // } catch (e) {
  //   gasPrice = await web3.eth.getGasPrice() * 10n;
  // }

  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: validatorRewardManagerContract.options.address,
    data: fnToEncode.encodeABI(),
    chainId: ctx.config.networkID
  }

  return rawTx;
}

/**
 * @description Creates the unsigned claim (staking rewards) transaction and stores unsigned transaction object in the file id
 * @param rawTx - unsigned transaction object
 * @param fileId - file id
 * @returns returns the ForDefi hash of the transaction
 */
export function saveUnsignedClaimTx(rawTx: TransactionLike, fileId: string): string {

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }
  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}

/**
 * @description - sends the EVM transaction to the blockchain
 * @param ctx - context
 * @param fileId - id of the file containing the unsigned transaction
 * @returns - the transaction hash
 */
export async function sendSignedEvmTransaction(ctx: Context, fileId: string): Promise<string> {
  const waitFinalize3 = waitFinalize(ctx.web3);
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }

  // read unsigned tx data
  const unsignedTxJson = readUnsignedEvmTx(fileId);

  // read signed tx data
  const signedTxJson = readSignedEvmTx(fileId);

  // read signature
  const signature = signedTxJson.signature;

  // create raw signed tx
  const ethersTx = Transaction.from(unsignedTxJson.rawTx);
  ethersTx.signature = prefix0x(signature);
  const serializedSigned = ethersTx.serialized;

  // send signed tx to the network
  const receipt = await waitFinalize3(ctx.cAddressHex, () => ctx.web3.eth.sendSignedTransaction(serializedSigned)).catch((error: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      "innerError" in error &&
      error.innerError &&
      typeof error.innerError === 'object' &&
      "message" in error.innerError
    ) {
      console.log(chalk.red(error.innerError.message))
    } else if (
      error &&
      typeof error === 'object' &&
      'reason' in error
    ) {
      console.log(chalk.red(error.reason))
    } else {
      console.log(chalk.red(error))
      console.dir(error);
    }
    process.exit(1);
  });
  // Validate receipt
  if (!receipt.transactionHash) {
    throw new Error('Transaction receipt missing transactionHash');
  }
  return toHex(receipt.transactionHash);
}

export async function signEvmTransaction(
  type: "ledger" | "privateKey",
  ctx: Context,
  unsignedTx: TransactionLike,
  derivationPath?: string,
) {
  logInfo('Signing transaction...')
  if (!ctx.web3) throw new Error("Web3 instance missing in context");
  if (!ctx.cAddressHex) throw new Error("cAddressHex missing in context");
  const web3 = ctx.web3;
  const waitFinalize3 = waitFinalize(web3);

  // Default to legacy transaction (configurable via unsignedTx.type)
  const txType = unsignedTx.type ?? 0;
  const ethersTx = Transaction.from({ ...unsignedTx, type: txType });
  let signedTxHex: string;

  if (type === "ledger") {
    if (!derivationPath) throw new Error("Derivation path required for Ledger signing");
    const serializedUnsignedTx = ethersTx.unsignedSerialized;
    const signature = await ledger.signEvmTransaction(derivationPath, serializedUnsignedTx)
    const sig = signature.startsWith("0x") ? signature.slice(2) : signature;
    if (sig.length < 130 || sig.length > 132) {
      throw new Error(`Invalid signature length: ${sig.length / 2} bytes`);
    }
    const parsedSignature = {
      r: `0x${sig.slice(0, 64)}`,
      s: `0x${sig.slice(64, 128)}`,
      v: parseInt(sig.slice(128, 130), 16) // v is typically 27 or 28
    };
    ethersTx.signature = parsedSignature;
    signedTxHex = ethersTx.serialized;
  } else if (type === "privateKey") {
    if (!ctx.privkHex) throw new Error("No private key found in context");
    const wallet = new Wallet(ctx.privkHex);
    const ethersTx = Transaction.from(unsignedTx);
    signedTxHex = await wallet.signTransaction(ethersTx);
  }
  // send signed tx to the network
  const receipt = await waitFinalize3(ctx.cAddressHex, () => web3.eth.sendSignedTransaction(signedTxHex)).catch((error: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      "innerError" in error &&
      error.innerError &&
      typeof error.innerError === 'object' &&
      "message" in error.innerError
    ) {
      console.log(chalk.red(error.innerError.message))
    } else if (
      error &&
      typeof error === 'object' &&
      'reason' in error
    ) {
      console.log(chalk.red(error.reason))
    } else {
      console.log(chalk.red(error))
      console.dir(error);
    }
    process.exit(1);
  });
  if (!receipt.transactionHash) {
    const error = new Error('Transaction receipt missing transactionHash');
    throw error;
  }
  return toHex(receipt.transactionHash);
}

export async function getStateOfRewards(web3: Web3, owner: string): Promise<{
  unclaimedRewards: string;
  totalRewards: string;
  claimedRewards: string;
}> {
  const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
  const validatorRewardManagerAddress: string = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("ValidatorRewardManager").call();
  const validatorRewardManagerContract = getWeb3Contract(web3, validatorRewardManagerAddress, validatorRewardManagerABI);
  if (validatorRewardManagerAddress == ZeroAddress) {
    throw new Error("ValidatorRewardManager contract address not found");
  }

  // check if unclaimed rewards are available
  const rewardsState = await validatorRewardManagerContract.methods.getStateOfRewards(owner).call();
  if (!rewardsState) {
    throw new Error("Invalid rewards response");
  }
  const totalRewardsWei = BigInt(rewardsState[0]);
  const claimedRewardsWei = BigInt(rewardsState[1]);
  const unclaimedRewardsWei: bigint = totalRewardsWei - claimedRewardsWei;
  const unclaimedRewards = ethers.formatUnits(unclaimedRewardsWei, 18); // convert to FLR
  const totalRewards = ethers.formatUnits(totalRewardsWei, 18);
  const claimedRewards = ethers.formatUnits(claimedRewardsWei, 18);
  return { unclaimedRewards, totalRewards, claimedRewards };
}

/**
 * @description Creates the set executors transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param fileId - file id
 * @param nonce - nonce
 * @param executors - array of executors addresses
 * @returns returns the ForDefi hash of the transaction
 */
export async function createSetClaimExecutorsTransaction(
  ctx: Context,
  fileId: string,
  executors: string[],
  nonce: number
): Promise<string> {
  const web3 = ctx.web3;
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }

  const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
  const claimSetupManagerAddress: string = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("ClaimSetupManager").call();
  if (claimSetupManagerAddress == ZeroAddress) {
    throw new Error("ClaimSetupManager contract address not found");
  }
  const txNonce = nonce ?? Number(await web3.eth.getTransactionCount(ctx.cAddressHex));
  const claimSetupManagerWeb3Contract = getWeb3Contract(web3, claimSetupManagerAddress, claimSetupManagerABI);

  // filter out empty strings (if removing executors)
  executors = executors.filter(executor => executor.trim() !== '');

  // check if executors are registered (and addresses are valid) and sum their fees
  let totalFee = 0n;
  for (const executor of executors) {
    const executorInfo: [boolean, bigint] = await claimSetupManagerWeb3Contract.methods.getExecutorInfo(web3.utils.toChecksumAddress(executor)).call();
    if (!executorInfo[0]) {
      throw new Error(`Executor ${executor} is not registered`);
    }
    totalFee += executorInfo[1];
  }
  const fnToEncode = claimSetupManagerWeb3Contract.methods.setClaimExecutors(executors);
  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: claimSetupManagerWeb3Contract.options.address,
    data: fnToEncode.encodeABI(),
    chainId: ctx.config.networkID,
    value: totalFee.toString()
  }

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }
  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}

/**
 * @description Creates the set allowed claim recipients transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param fileId - file id
 * @param nonce - nonce
 * @param recipients - array of allowed claim recipients addresses
 * @returns returns the ForDefi hash of the transaction
 */
export async function createSetAllowedClaimRecipientsTransaction(
  ctx: Context,
  fileId: string,
  recipients: string[],
  nonce: number
): Promise<string> {
  const web3 = ctx.web3;
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }

  const flareContractRegistryWeb3Contract = getWeb3Contract(web3, flareContractRegistryAddress, flareContractRegistryABI);
  const claimSetupManagerAddress: string = await flareContractRegistryWeb3Contract.methods.getContractAddressByName("ClaimSetupManager").call();
  if (claimSetupManagerAddress == ZeroAddress) {
    throw new Error("ClaimSetupManager contract address not found");
  }
  const txNonce = nonce ?? Number(await web3.eth.getTransactionCount(ctx.cAddressHex));
  const claimSetupManagerWeb3Contract = getWeb3Contract(web3, claimSetupManagerAddress, claimSetupManagerABI);

  // filter out empty strings (if removing recipients)
  recipients = recipients.filter(recipient => recipient.trim() !== '');

  const fnToEncode = claimSetupManagerWeb3Contract.methods.setAllowedClaimRecipients(recipients);
  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: claimSetupManagerWeb3Contract.options.address,
    data: fnToEncode.encodeABI(),
    chainId: ctx.config.networkID
  }

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }

  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}

/**
 * @description Creates a custom C-Chain transaction and stores unsigned transaction object in the file id
 * @param ctx - context
 * @param fileId - file id
 * @param data - data field for the transaction
 * @param toAddress - the recipient address
 * @param value - value to be sent (in wei)
 * @param nonce - nonce for the transaction
 * @returns returns the ForDefi hash of the transaction
 */
export async function createCustomCChainTransaction(
  ctx: Context,
  fileId: string,
  toAddress: string,
  data: string,
  value: string,
  nonce: number,
): Promise<string> {
  const web3 = ctx.web3;
  if (!ctx.cAddressHex) {
    throw new Error("cAddressHex not found in context");
  }

  const txNonce = nonce ?? Number(await web3.eth.getTransactionCount(ctx.cAddressHex));

  // check if address is valid
  web3.utils.toChecksumAddress(toAddress);

  const rawTx: TransactionLike = {
    nonce: txNonce,
    gasPrice: 200_000_000_000,
    gasLimit: 4_000_000,
    to: toAddress,
    value: value,
    data: data,
    chainId: ctx.config.chainID
  }

  // serialized unsigned transaction
  const ethersTx = Transaction.from(rawTx)
  const hash = unPrefix0x(ethersTx.unsignedHash);
  const forDefiHash = Buffer.from(hash, 'hex').toString('base64');

  const unsignedTx = <UnsignedEvmTxJson>{
    transactionType: 'EVM',
    rawTx: rawTx,
    message: hash,
    forDefiHash: forDefiHash
  }

  // save tx data
  saveUnsignedEvmTx(unsignedTx, fileId);

  return forDefiHash;
}