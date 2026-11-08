import { styleText } from "node:util";
import type { NetworkName } from "../chain/network";

/** The interactive menu: each task's id and its label, in menu order. */
export const taskConstants = {
  addresses: "View chain addresses",
  balance: "Check on-chain balance",
  validators: "Get validator info",
  CP: "Move assets from C-chain to P-chain",
  PC: "Move assets from P-chain to C-chain",
  stake: "Add a validator node",
  delegate: "Delegate to a validator node",
  import: "Import Funds (in case export fails for either P chain or C chain)",
  transfer: "Transfer funds to another P-chain address",
  claim: "Claim staking rewards",
  addAutoRenewedValidator: "Add an auto-renewed validator node",
  setAutoRenewedValidatorConfig: "Change the auto-renew period of a validator node",
  quit: "Quit",
} as const;

export type TaskId = keyof typeof taskConstants;

/** The menu label of every network of the network table (chain/network.ts): a network added there needs one. */
export const networkConstants: Readonly<Record<NetworkName, string>> = {
  flare: "Flare " + styleText("green", "(mainnet)"),
  songbird: "Songbird " + styleText("green", "(canary)"),
  costwo: "Coston2 " + styleText("yellow", "(testnet)"),
  coston: "Coston " + styleText("yellow", "(testnet)"),
  localflare: "LocalHost " + styleText("red", "(devnet)"),
};

/** The supported wallets and their menu labels. */
export const walletConstants = {
  ledger: "Ledger",
  privateKey: "Private Key " + styleText("red", "(not recommended!)"),
  quit: "Quit",
} as const;

export type WalletId = keyof typeof walletConstants;

/** The Ledger derivation path modes and their menu labels. */
export const derivationModeConstants = {
  bip44: "BIP44 (Default)",
  ledger_live: "Ledger Live",
} as const;

export type DerivationMode = keyof typeof derivationModeConstants;
