import { styleText } from "node:util";
import inquirer from "inquirer";
import { parseDuration, parseFlr, parseFlrToWei } from "../chain/units";
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

const ask = (text: string): string => styleText("magenta", text);

/** A question with a hint in brackets: "<text> <hint>:". */
const askWithHint = (text: string, hint: string): string => `${ask(text)} ${styleText("yellow", hint)}${ask(":")}`;

/** inquirer `validate`: true when `parse` accepts the input, else its error message (the prompt asks again). */
function validationOf(parse: () => unknown): true | string {
  try {
    parse();
    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

interface InputOptions {
  /** Answered by Enter on an empty line. */
  default?: string | undefined;
  /** true accepts the answer; a message is shown and the question asked again. */
  validate?: (value: string) => true | string;
}

async function input(message: string, options: InputOptions = {}): Promise<string> {
  const { answer } = await inquirer.prompt<{ answer: string }>([
    { type: "input", name: "answer", message, ...options },
  ]);
  return answer;
}

async function select<T>(message: string, choices: Choice<T>[]): Promise<T> {
  const { answer } = await inquirer.prompt<{ answer: T }>([{ type: "list", name: "answer", message, choices }]);
  return answer;
}

/** A yes/no question; the default is no. */
async function confirm(message: string): Promise<boolean> {
  const { answer } = await inquirer.prompt<{ answer: boolean }>([
    { type: "confirm", name: "answer", default: false, message },
  ]);
  return answer;
}

/** The questions of interactive mode; each resolves to the answer. */
export const prompts = {
  connectWallet: (): Promise<WalletId> =>
    select(ask("How do you want to connect your wallet?"), choicesOf(walletConstants)),

  derivationType: (): Promise<DerivationMode> =>
    select(ask("Choose derivation path..."), choicesOf(derivationModeConstants)),

  pvtKeyPath: (): Promise<string> =>
    input(askWithHint("Enter Path to Private Key file", "(E.g. /home/wallet/pvtKeyFile)")),

  amount: (defaultAmount?: string): Promise<string> =>
    input(ask("Enter amount (in FLR):"), {
      default: defaultAmount,
      validate: (value) => validationOf(() => parseFlr(value)),
    }),

  // exportCP and importPC fee: the default is the estimate from the current base fee, when there is one
  fees: (estimate: string | undefined, symbol: string): Promise<string> => {
    const hint =
      estimate === undefined
        ? "(leave empty to estimate it at twice the current base fee)"
        : `(Enter accepts ${estimate} ${symbol}: twice the current base fee, headroom for a rise before it lands)`;
    return input(askWithHint("Enter fee (in FLR)", hint), {
      default: estimate,
      validate: (value) => (value.trim() === "" ? true : validationOf(() => parseFlr(value))),
    });
  },

  nodeId: (): Promise<string> => input(askWithHint("Enter NodeId", "(E.g. NodeID-FQKTLuZHEsjCxPeFTFgsojsucmdyNDsz1)")),

  unixTime: (timeType: string): Promise<string> =>
    input(
      askWithHint(`Enter ${timeType} time`, "(unix seconds, e.g. 1693185095, or a duration from now such as 2d12h)")
    ),

  // No default: for a configuration change, a default of 0 would stop the validator on a stray Enter.
  period: (purpose: "add" | "change"): Promise<string> => {
    const hint =
      purpose === "change"
        ? "(seconds or a duration such as 14d; 0 stops auto-renewal at the end of the current cycle)"
        : "(seconds or a duration such as 14d)";
    return input(askWithHint("Enter the validation period", hint), {
      validate: (value) => validationOf(() => parseDuration(value)),
    });
  },

  confirmStopAutoRenewal: (cycleEnd?: string): Promise<boolean> =>
    confirm(
      ask(
        `A period of 0 stops auto-renewal: the validator leaves at the end of its current cycle` +
          `${cycleEnd ? ` (${cycleEnd})` : ""} and the stake is returned. Stop auto-renewal?`
      )
    ),

  ctxFile: (): Promise<boolean> => select(ask("Do you wish to continue with this?"), YES_NO),

  // a context file that is not a Ledger one (e.g. ForDefi) would be replaced
  replaceCtxFile: (file: string): Promise<boolean> =>
    confirm(ask(`Replace ${file} with a Ledger context? The current file is kept as a ${file}.<time>.bak backup.`)),

  // a typed C-chain fee below the cost at the current base fee; No asks for the fee again
  confirmLowFee: (): Promise<boolean> => confirm(ask("Send with this fee anyway?")),

  selectNetwork: (): Promise<NetworkId> =>
    select(ask("Which network do you want to connect to?"), choicesOf(networkConstants)),

  selectTask: (): Promise<TaskId> => select(ask("What do you want to do?"), choicesOf(taskConstants)),

  selectAddress: <T>(choices: Choice<T>[]): Promise<T> => select(ask("Which address do you want to use?"), choices),

  delegationFee: (): Promise<string> => input(askWithHint("Enter delegation fee", "(E.g. 10)")),

  importTrxType: (): Promise<"P" | "C"> =>
    select(ask("Please select the destination chain to which you want to import your funds?"), [
      { name: "P", value: "P" },
      { name: "C", value: "C" },
    ]),

  popBLSPublicKey: (): Promise<string> =>
    input(ask("Please enter the popBLSPublicKey:"), {
      validate: (value) => validationOf(() => parseBlsHex(value, "publicKey")),
    }),

  popBLSSignature: (): Promise<string> =>
    input(ask("Please enter the popBLSSignature:"), {
      validate: (value) => validationOf(() => parseBlsHex(value, "signature")),
    }),

  transferAddress: (): Promise<string> => input(ask("Enter destination P-chain address:")),

  wrapRewards: (): Promise<boolean> => select(ask("Should claimed rewards be wrapped?"), YES_NO),

  recipientAddress: (defaultAddress?: string): Promise<string> =>
    input(ask("Please enter the recipient address (default address is reward owner):"), { default: defaultAddress }),

  // a C-chain amount: wei precision (18 decimals)
  claimAmount: (): Promise<string> =>
    input(ask("Please enter the amount to claim:"), {
      validate: (value) => validationOf(() => parseFlrToWei(value)),
    }),

  claimAllUnclaimed: (totalUnclaimed?: string, symbol?: string): Promise<boolean> =>
    select(
      ask(
        `Do you want to claim all unclaimed rewards? ${totalUnclaimed ? "(total unclaimed: " + totalUnclaimed + " " + symbol + ")" : ""}`
      ),
      YES_NO
    ),
};
