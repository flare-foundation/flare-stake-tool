import { styleText } from "node:util";

/**
 * @description Object that contains list of tasks user can perform as its keys and their corresponding CLI commands as values.
 */
export type ScreenConstants = Record<string, string>;

export const taskConstants: ScreenConstants = {
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
};

/**
 * @description Constant object which contains the supported networks and their corresponding formatted output names as key-value pairs.
 */
export const networkConstants: ScreenConstants = {
  flare: "Flare " + styleText("green", "(mainnet)"),
  songbird: "Songbird " + styleText("green", "(canary)"),
  costwo: "Coston2 " + styleText("yellow", "(testnet)"),
  coston: "Coston " + styleText("yellow", "(testnet)"),
  localflare: "LocalHost " + styleText("red", "(devnet)"),
};

/**
 * @description Constant object which contains the supported wallets and their corresponding formatted output names as key-value pairs.
 */
export const walletConstants: ScreenConstants = {
  ledger: "Ledger",
  privateKey: "Private Key " + styleText("red", "(not recommended!)"),
};

/**
 * @description Constant object which contains the supported wallet derivation path modes and their corresponding formatted output names as key-value pairs.
 */
export const derivationModeConstants: ScreenConstants = {
  bip44: "BIP44 (Default)",
  ledger_live: "Ledger Live",
};
