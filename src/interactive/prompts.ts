import { styleText } from "node:util";
import inquirer from "inquirer";
import { parseDuration, parseFlr } from "../chain/units";
import { parseBlsHex } from "../cli/inputs";
import {
  derivationModeConstants,
  networkConstants,
  taskConstants,
  walletConstants,
  type DerivationMode,
  type NetworkId,
  type TaskId,
  type WalletId,
} from "../constants/screen";

/** A list choice: inquirer shows `name` and answers `value`. */
export interface Choice<T> {
  name: string;
  value: T;
}

/** The choices of a label table, in its order: each shows its label and answers its key. */
function choicesOf<K extends string>(labels: Readonly<Record<K, string>>): Choice<K>[] {
  return (Object.keys(labels) as K[]).map((value) => ({ name: labels[value], value }));
}

const YES_NO: Choice<boolean>[] = [
  { name: "Yes", value: true },
  { name: "No", value: false },
];

/** inquirer `validate`: true when `parse` accepts the input, else its error message (the prompt asks again). */
function validationOf(parse: () => unknown): true | string {
  try {
    parse();
    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Provides various prompts used in the CLI for user interaction.
 */
export const prompts = {
  connectWallet: async () => {
    const questions = [
      {
        type: "list",
        name: "wallet",
        message: styleText("magenta", "How do you want to connect your wallet?"),
        choices: choicesOf(walletConstants),
      },
    ];
    return inquirer.prompt<{ wallet: WalletId }>(questions);
  },
  derivationType: async () => {
    const questions = [
      {
        type: "list",
        name: "derivation",
        message: styleText("magenta", "Choose derivation path..."),
        choices: choicesOf(derivationModeConstants),
      },
    ];
    return inquirer.prompt<{ derivation: DerivationMode }>(questions);
  },
  pvtKeyPath: async () => {
    const questions = [
      {
        type: "input",
        name: "pvtKeyPath",
        message:
          styleText("magenta", "Enter Path to Private Key file") +
          " " +
          styleText("yellow", "(E.g. /home/wallet/pvtKeyFile)") +
          styleText("magenta", ":"),
      },
    ];
    return inquirer.prompt<{ pvtKeyPath: string }>(questions);
  },

  amount: async (amountPurpose: string = "", defaultAmount?: string) => {
    const questions = [
      {
        type: "input",
        default: defaultAmount,
        name: "amount",
        message: styleText("magenta", `Enter amount ${amountPurpose}`) + " " + styleText("magenta", `(in FLR):`),
      },
    ];
    return inquirer.prompt<{ amount: string }>(questions);
  },

  // exportCP and importPC fee: the default is the estimate from the current base fee, when there is one
  fees: async (estimate: string | undefined, symbol: string) => {
    const hint =
      estimate === undefined
        ? "(leave empty to estimate it at twice the current base fee)"
        : `(Enter accepts ${estimate} ${symbol}: twice the current base fee, headroom for a rise before it lands)`;
    const questions = [
      {
        type: "input",
        name: "fees",
        default: estimate,
        message:
          styleText("magenta", "Enter fee (in FLR)") + " " + styleText("yellow", hint) + styleText("magenta", ":"),
        validate: (value: string) => (value.trim() === "" ? true : validationOf(() => parseFlr(value))),
      },
    ];
    return inquirer.prompt<{ fees: string }>(questions);
  },

  nodeId: async () => {
    const questions = [
      {
        type: "input",
        name: "id",
        message:
          styleText("magenta", "Enter NodeId") +
          " " +
          styleText("yellow", "(E.g. NodeID-FQKTLuZHEsjCxPeFTFgsojsucmdyNDsz1)") +
          styleText("magenta", ":"),
      },
    ];
    return inquirer.prompt<{ id: string }>(questions);
  },

  unixTime: async (timeType: string) => {
    const questions = [
      {
        type: "input",
        name: "time",
        message:
          styleText("magenta", `Enter ${timeType} time`) +
          " " +
          styleText("yellow", "(unix seconds, e.g. 1693185095, or a duration from now such as 2d12h)") +
          styleText("magenta", ":"),
      },
    ];
    return inquirer.prompt<{ time: string }>(questions);
  },

  // No default: for a configuration change, a default of 0 would stop the validator on a stray Enter.
  period: async (purpose: "add" | "change") => {
    const hint =
      purpose === "change"
        ? "(seconds or a duration such as 14d; 0 stops auto-renewal at the end of the current cycle)"
        : "(seconds or a duration such as 14d)";
    const questions = [
      {
        type: "input",
        name: "period",
        message:
          styleText("magenta", "Enter the validation period") +
          " " +
          styleText("yellow", hint) +
          styleText("magenta", ":"),
        validate: (value: string) => validationOf(() => parseDuration(value)),
      },
    ];
    return inquirer.prompt<{ period: string }>(questions);
  },

  confirmStopAutoRenewal: async (cycleEnd?: string) => {
    const questions = [
      {
        type: "confirm",
        name: "stop",
        default: false,
        message: styleText(
          "magenta",
          `A period of 0 stops auto-renewal: the validator leaves at the end of its current cycle` +
            `${cycleEnd ? ` (${cycleEnd})` : ""} and the stake is returned. Stop auto-renewal?`
        ),
      },
    ];
    return inquirer.prompt<{ stop: boolean }>(questions);
  },

  ctxFile: async () => {
    const questions = [
      {
        type: "list",
        name: "isContinue",
        message: styleText("magenta", "Do you wish to continue with this?"),
        choices: YES_NO,
      },
    ];
    return inquirer.prompt<{ isContinue: boolean }>(questions);
  },

  // a context file that is not a Ledger one (e.g. ForDefi) would be replaced
  replaceCtxFile: async (file: string) => {
    const questions = [
      {
        type: "confirm",
        name: "replace",
        default: false,
        message: styleText(
          "magenta",
          `Replace ${file} with a Ledger context? The current file is kept as a ${file}.<time>.bak backup.`
        ),
      },
    ];
    return inquirer.prompt<{ replace: boolean }>(questions);
  },

  // a typed C-chain fee below the cost at the current base fee; No asks for the fee again
  confirmLowFee: async () => {
    const questions = [
      {
        type: "confirm",
        name: "send",
        default: false,
        message: styleText("magenta", "Send with this fee anyway?"),
      },
    ];
    return inquirer.prompt<{ send: boolean }>(questions);
  },

  selectNetwork: async () => {
    const questions = [
      {
        type: "list",
        name: "network",
        message: styleText("magenta", "Which network do you want to connect to?"),
        choices: choicesOf(networkConstants),
      },
    ];
    return inquirer.prompt<{ network: NetworkId }>(questions);
  },

  selectTask: async () => {
    const questions = [
      {
        type: "list",
        name: "task",
        message: styleText("magenta", "What do you want to do?"),
        choices: choicesOf(taskConstants),
      },
    ];
    return inquirer.prompt<{ task: TaskId }>(questions);
  },

  selectAddress: async <T>(choices: Choice<T>[]) => {
    const questions = [
      {
        type: "list",
        name: "address",
        message: styleText("magenta", "Which address do you want to use?"),
        choices,
      },
    ];
    return inquirer.prompt<{ address: T }>(questions);
  },

  delegationFee: async () => {
    const questions = [
      {
        type: "input",
        name: "fee",
        message:
          styleText("magenta", "Enter delegation fee") +
          " " +
          styleText("yellow", "(E.g. 10)") +
          styleText("magenta", ":"),
      },
    ];
    return inquirer.prompt<{ fee: string }>(questions);
  },

  importTrxType: async () => {
    const questions = [
      {
        type: "list",
        name: "type",
        message: styleText("magenta", "Please select the destination chain to which you want to import your funds?"),
        choices: ["P", "C"],
      },
    ];
    return inquirer.prompt<{ type: "P" | "C" }>(questions);
  },
  popBLSPublicKey: async () => {
    const questions = [
      {
        type: "input",
        name: "popBLSPublicKey",
        message: styleText("magenta", "Please enter the popBLSPublicKey:"),
        validate: (value: string) => validationOf(() => parseBlsHex(value, "publicKey")),
      },
    ];
    return inquirer.prompt<{ popBLSPublicKey: string }>(questions);
  },
  popBLSSignature: async () => {
    const questions = [
      {
        type: "input",
        name: "popBLSSignature",
        message: styleText("magenta", "Please enter the popBLSSignature:"),
        validate: (value: string) => validationOf(() => parseBlsHex(value, "signature")),
      },
    ];
    return inquirer.prompt<{ popBLSSignature: string }>(questions);
  },
  transferAddress: async () => {
    const questions = [
      {
        type: "input",
        name: "transferAddress",
        message: styleText("magenta", "Enter destination P-chain address:"),
      },
    ];
    return inquirer.prompt<{ transferAddress: string }>(questions);
  },
  // wrap rewards when claiming staking rewards
  wrapRewards: async () => {
    const questions = [
      {
        type: "list",
        name: "wrapRewards",
        message: styleText("magenta", "Should claimed rewards be wrapped?"),
        choices: YES_NO,
      },
    ];
    return inquirer.prompt<{ wrapRewards: boolean }>(questions);
  },
  // recipient address to receive claimed staking rewards
  recipientAddress: async (defaultAddress?: string) => {
    const questions = [
      {
        type: "input",
        default: defaultAddress,
        name: "recipientAddress",
        message: styleText("magenta", "Please enter the recipient address (default address is reward owner):"),
      },
    ];
    return inquirer.prompt<{ recipientAddress: string }>(questions);
  },
  claimAmount: async () => {
    const questions = [
      {
        type: "input",
        name: "claimAmount",
        message: styleText("magenta", "Please enter the amount to claim:"),
      },
    ];
    return inquirer.prompt<{ claimAmount: number }>(questions);
  },
  claimAllUnclaimed: async (totalUnclaimed?: string, symbol?: string) => {
    const questions = [
      {
        type: "list",
        name: "claimAllUnclaimed",
        message: styleText(
          "magenta",
          `Do you want to claim all unclaimed rewards? ${totalUnclaimed ? "(total unclaimed: " + totalUnclaimed + " " + symbol + ")" : ""}`
        ),
        choices: YES_NO,
      },
    ];
    return inquirer.prompt<{ claimAllUnclaimed: boolean }>(questions);
  },
};
