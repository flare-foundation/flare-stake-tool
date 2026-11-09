/**
 * The vocabulary of the transaction pipeline: what a command asks for
 * (TxRequest), what a builder produces (UnsignedTxBundle), how a signer answers
 * (SignResult) and what the user gets back (Outcome).
 */
import type { UnsignedTx } from "@flarenetwork/flarejs";
import type { JsonRpcProvider, Transaction, TransactionLike } from "ethers";
import type { Clients } from "../chain/clients";
import type { Account } from "../chain/keys";
import type { NetworkConfig } from "../chain/network";
import type { NFlr, Wei } from "../chain/units";
import type { EvmFees } from "../constants/fees";
import type { BuiltDetails } from "./details";

export interface Env {
  readonly network: NetworkConfig;
  readonly clients: Clients;
}

/** What reading the C-chain contracts and building EVM transactions use of an Env. */
export interface EvmEnv {
  readonly network: Pick<NetworkConfig, "chainId" | "symbol">;
  readonly clients: { readonly provider: Pick<JsonRpcProvider, "call" | "getCode" | "getTransactionCount"> };
}

export const ATOMIC_TX_TYPES = [
  "exportCP",
  "importCP",
  "exportPC",
  "importPC",
  "stake",
  "delegate",
  "transfer",
  "addAutoRenewedValidator",
  "setAutoRenewedValidatorConfig",
] as const;
export type AtomicTxType = (typeof ATOMIC_TX_TYPES)[number];

export const EVM_TX_TYPES = [
  "claim",
  "withdrawal",
  "setClaimExecutors",
  "setAllowedClaimRecipients",
  "customCChainTx",
] as const;
export type EvmTxType = (typeof EVM_TX_TYPES)[number];
export type TxType = AtomicTxType | EvmTxType;

/** Which chain each atomic transaction is issued to: a new type has to be given one. */
const CHAIN_OF_ATOMIC_TX: Readonly<Record<AtomicTxType, "P" | "C">> = {
  exportCP: "C",
  importCP: "P",
  exportPC: "P",
  importPC: "C",
  stake: "P",
  delegate: "P",
  transfer: "P",
  addAutoRenewedValidator: "P",
  setAutoRenewedValidatorConfig: "P",
};

/** Which chain an atomic transaction is issued to. exportCP/importPC are C-chain atomic transactions. */
export function chainOfAtomicTx(type: AtomicTxType): "P" | "C" {
  return CHAIN_OF_ATOMIC_TX[type];
}

export const isAtomicTxType = (value: string): value is AtomicTxType =>
  (ATOMIC_TX_TYPES as readonly string[]).includes(value);

/** Amounts are nFLR on the P-chain and atomic side, wei on the C-chain side. Times are unix seconds. */
export type TxRequest =
  | { type: "exportCP"; amount: NFlr; fee?: NFlr | undefined; nonce?: bigint | undefined }
  | { type: "importCP" }
  | { type: "exportPC"; amount?: NFlr | undefined }
  | { type: "importPC"; fee?: NFlr | undefined }
  | {
      type: "stake";
      nodeId: string;
      amount: NFlr;
      startTime?: bigint | undefined;
      endTime: bigint;
      delegationFeeShares: number;
      blsPublicKey: Uint8Array;
      blsSignature: Uint8Array;
    }
  | { type: "delegate"; nodeId: string; amount: NFlr; startTime?: bigint | undefined; endTime: bigint }
  | { type: "transfer"; amount: NFlr; to: string }
  | {
      type: "addAutoRenewedValidator";
      nodeId: string;
      amount: NFlr;
      period: bigint;
      delegationFeeShares: number;
      blsPublicKey: Uint8Array;
      blsSignature: Uint8Array;
      ownerAddress?: string | undefined;
      autoCompoundShares?: number | undefined;
    }
  | {
      type: "setAutoRenewedValidatorConfig";
      nodeId?: string | undefined;
      validatorTxId?: string | undefined;
      period: bigint;
      autoCompoundShares?: number | undefined;
    }
  | {
      type: "claim";
      recipient: string;
      amount?: Wei | undefined;
      wrap: boolean;
      nonce?: number | undefined;
      fees: EvmFees;
    }
  | { type: "withdrawal"; to: string; amount: Wei; nonce?: number | undefined; fees: EvmFees }
  | { type: "setClaimExecutors"; executors: string[]; nonce?: number | undefined; fees: EvmFees }
  | { type: "setAllowedClaimRecipients"; recipients: string[]; nonce?: number | undefined; fees: EvmFees }
  | { type: "customCChainTx"; to: string; value: Wei; data: string; nonce?: number | undefined; fees: EvmFees };

export type TxRequestOf<T extends TxType> = Extract<TxRequest, { type: T }>;

/**
 * The determinism contract between a signer and the builders. Several ForDefi
 * signers build the same transaction independently and must get the same hash,
 * so the file signer pins everything that would otherwise come from the clock
 * or the fee market.
 */
export interface BuildPolicy {
  /** P-chain fee price, or "chain" for the live fee state. */
  readonly feePrice: bigint | "chain";
  /** Start time for stake/delegate when none is given. */
  readonly defaultStartTime: bigint | "now";
  /** exportCP/importPC refuse to estimate the fee from the chain. */
  readonly requireExplicitFee: boolean;
  /**
   * The nonce of a C-chain EVM transaction built without --nonce. "pending" counts the transactions the node holds
   * too, so one signed and sent now does not take the nonce of one still waiting (and replace it if it pays more);
   * "latest" is the same on every node at a height, so ForDefi co-signers build the same transaction.
   */
  readonly evmNonce: "pending" | "latest";
  /**
   * The time P-chain UTXO time locks are checked against (flarejs `minIssuanceTime`). "now" for a signer that sends
   * right away. Unsigned files use 1, the earliest time at which a UTXO without a time lock can be spent, so
   * co-signers building a few seconds apart pick the same inputs even when a lock ends in between: every time-locked
   * UTXO counts as still locked, even once its lock has passed. It is never spent as unlocked funds (a transfer, an
   * export, a fee); stake and delegate can still stake a stakeable-locked one without an owner lock, and the stake
   * keeps its lock.
   */
  readonly lockCheckTime: bigint | "now";
}

export const IMMEDIATE_SIGNER_POLICY: BuildPolicy = {
  feePrice: "chain",
  defaultStartTime: "now",
  requireExplicitFee: false,
  evmNonce: "pending",
  lockCheckTime: "now",
};
export const FILE_SIGNER_POLICY: BuildPolicy = {
  feePrice: 1000n,
  defaultStartTime: 1n,
  requireExplicitFee: true,
  evmNonce: "latest",
  lockCheckTime: 1n,
};

export type UnsignedTxBundle =
  | {
      kind: "atomic";
      chain: "P" | "C";
      txType: AtomicTxType;
      unsignedTx: UnsignedTx;
      /** sha256 of the unsigned bytes: what every signer signs and what the file flow calls `message`. */
      digest: Uint8Array;
      /** What the user should know about the build, such as UTXOs it left out; printed with the outcome. */
      notices?: readonly string[] | undefined;
    }
  | {
      kind: "evm";
      txType: EvmTxType;
      /** ethers Transaction carrying its type; signature is attached in place. */
      tx: Transaction;
      /** The fields written to the unsigned file (frozen shape). */
      rawTx: TransactionLike;
      /** keccak256 of the unsigned serialization. */
      digest: Uint8Array;
    };

export type SignResult =
  { status: "signed"; signature: Uint8Array } | { status: "pending"; id: string; forDefiHash: string; file: string };

/** Shown the details of a built transaction before it is signed; throwing stops it (interactive confirmation). */
export type BeforeSign = (details: BuiltDetails) => Promise<void>;

export interface Signer {
  readonly kind: "privateKey" | "ledger" | "file";
  readonly policy: BuildPolicy;
  account(): Promise<Account>;
  sign(bundle: UnsignedTxBundle): Promise<SignResult>;
}

/**
 * Values of a C-chain transaction that may come from the chain, read from the transaction built: the nonce (also
 * exportCP's), the gas limit (claim's and withdrawal's default depends on the recipient's code), the amount a claim
 * takes (all unclaimed rewards without -a) and the executor fees setClaimExecutors pays. They are printed, so that
 * ForDefi co-signers can pass the same nonce, gas limit and amount, and compare the fees.
 */
export interface EvmOutcomeValues {
  nonce: number;
  gasLimit?: bigint | undefined;
  claimed?: Wei | undefined;
  executorFees?: Wei | undefined;
}

/** What exportPC, importCP and importPC move to the other chain, read from the transaction: no option gives it. */
export interface MovedAmount {
  amount: NFlr;
  to: "P-chain" | "C-chain";
}

/**
 * `fee` (nFLR) is set for atomic transactions: what the transaction burns, read from its inputs and outputs. `moved`
 * is set for exportPC, importCP and importPC. `evm` is set for C-chain transactions. `notices` are the bundle's.
 */
export type Outcome =
  | {
      status: "sent";
      txId: string;
      chainStatus: string;
      fee?: NFlr | undefined;
      moved?: MovedAmount | undefined;
      evm?: EvmOutcomeValues | undefined;
      notices?: readonly string[] | undefined;
    }
  | {
      status: "pending";
      id: string;
      forDefiHash: string;
      file: string;
      fee?: NFlr | undefined;
      moved?: MovedAmount | undefined;
      evm?: EvmOutcomeValues | undefined;
      notices?: readonly string[] | undefined;
    };
