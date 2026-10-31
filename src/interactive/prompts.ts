import { styleText } from "node:util";
import inquirer from "inquirer";
import { taskConstants, networkConstants, walletConstants, derivationModeConstants } from "../constants/screen";

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
        choices: [...Object.values(walletConstants)],
        filter: (val: string) => {
          const key = Object.keys(walletConstants).find((key) => walletConstants[key] === val);
          return key;
        },
      },
    ];
    return inquirer.prompt<{ wallet: string }>(questions);
  },
  derivationType: async () => {
    const questions = [
      {
        type: "list",
        name: "derivation",
        message: styleText("magenta", "Choose derivation path..."),
        choices: [...Object.values(derivationModeConstants)],
        filter: (val: string) => {
          const key = Object.keys(derivationModeConstants).find((key) => derivationModeConstants[key] === val);
          return key;
        },
      },
    ];
    return inquirer.prompt<{ derivation: string }>(questions);
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

  // exportCP and importPC fees
  fees: async (defaultFees?: unknown) => {
    const questions = [
      {
        type: "input",
        default: defaultFees,
        name: "fees",
        message: styleText("magenta", "Enter fees (in FLR):"),
      },
    ];
    return inquirer.prompt<{ fees: string }>(questions);
  },

  // base fee for exportCP and importPC txs with private key
  baseFee: async (defaultBaseFee?: unknown) => {
    const questions = [
      {
        type: "input",
        default: defaultBaseFee,
        name: "baseFee",
        message: styleText("magenta", "Enter base fee (in nanoFLR):"),
      },
    ];
    return inquirer.prompt<{ baseFee: string }>(questions);
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

  period: async (defaultPeriod?: string) => {
    const questions = [
      {
        type: "input",
        default: defaultPeriod,
        name: "period",
        message:
          styleText("magenta", "Enter the validation period") +
          " " +
          styleText(
            "yellow",
            "(seconds or a duration such as 14d; 0 stops auto-renewal at the end of the current period)"
          ) +
          styleText("magenta", ":"),
      },
    ];
    return inquirer.prompt<{ period: string }>(questions);
  },

  ctxFile: async () => {
    const questions = [
      {
        type: "list",
        name: "isContinue",
        message: styleText("magenta", "Do you wish to continue with this?"),
        choices: ["Yes", "No"],
        filter: (val: string) => {
          return val === "Yes" ? true : false;
        },
      },
    ];
    return inquirer.prompt<{ isContinue: boolean }>(questions);
  },

  selectNetwork: async () => {
    const questions = [
      {
        type: "list",
        name: "network",
        message: styleText("magenta", "Which network do you want to connect to?"),
        choices: [...Object.values(networkConstants)],
        filter: (val: string) => {
          const key = Object.keys(networkConstants).find((key) => networkConstants[key] === val);
          return key;
        },
      },
    ];
    return inquirer.prompt<{ network: string }>(questions);
  },

  selectTask: async () => {
    const questions = [
      {
        type: "list",
        name: "task",
        message: styleText("magenta", "What do you want to do?"),
        choices: [...Object.values(taskConstants)],
        filter: (val: string) => {
          const key = Object.keys(taskConstants).find((key) => taskConstants[key] === val);
          return key;
        },
      },
    ];
    return inquirer.prompt<{ task: string }>(questions);
  },

  selectAddress: async (choiceList: string[]) => {
    const questions = [
      {
        type: "list",
        name: "address",
        message: styleText("magenta", "Which address do you want to use?"),
        choices: [...choiceList],
        filter: (val: string) => {
          const address = val.split(" ")[1];
          return address;
        },
      },
    ];
    return inquirer.prompt<{ address: string }>(questions);
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
    return inquirer.prompt<{ type: string }>(questions);
  },
  popBLSPublicKey: async () => {
    const questions = [
      {
        type: "input",
        name: "popBLSPublicKey",
        message: styleText("magenta", "Please enter the popBLSPublicKey:"),
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
        choices: ["Yes", "No"],
        filter: (val: string) => {
          return val === "Yes" ? true : false;
        },
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
        choices: ["Yes", "No"],
        filter: (val: string) => {
          return val === "Yes" ? true : false;
        },
      },
    ];
    return inquirer.prompt<{ claimAllUnclaimed: boolean }>(questions);
  },
};
