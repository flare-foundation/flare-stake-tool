import { styleText } from "node:util";
import inquirer from "inquirer";
import { pChainAddressBytes } from "../chain/keys";
import type { NetworkName } from "../chain/network";
import { parseDuration, parseEndTime, parseFlr, parseFlrToWei, parsePercentToShares } from "../chain/units";
import { DEFAULT_DELEGATION_FEE_PERCENT, checkProofOfPossession, parseBlsHex, parseNodeId } from "../cli/inputs";
import {
  derivationModeConstants,
  networkConstants,
  taskConstants,
  walletConstants,
  type DerivationMode,
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

/** The end time prompt's check: unix seconds or a duration from now. A past time passes (it gets a warning). */
export const validateEndTime = (value: string): true | string => validationOf(() => parseEndTime(value));

/** The delegation fee prompt's check: a percentage from 0 to 100; an empty answer stands for the default. */
export const validateDelegationFee = (value: string): true | string =>
  validationOf(() => parsePercentToShares(value || DEFAULT_DELEGATION_FEE_PERCENT));

interface InputOptions {
  /** Answered by Enter on an empty line. */
  default?: string | undefined;
  /** true accepts the answer; a message is shown and the question asked again. */
  validate?: (value: string) => true | string;
}

/** The exit code of a session cancelled with Ctrl-C at a question: 128 + SIGINT, what a shell reports for Ctrl-C. */
export const CANCELLED_EXIT_CODE = 130;

type Questions = Parameters<typeof inquirer.prompt>[0];

/**
 * inquirer's prompt, with Ctrl-C ending the session with exit code 130. inquirer 8 answers Ctrl-C by closing the
 * prompt and sending its own process SIGINT, and the process can end before that signal arrives, with code 0. A key
 * handler installed before inquirer's readline runs first and exits. Ctrl-D on an empty answer ends the input, which
 * readline answers by closing, and inquirer then failed with a stack trace and exit code 0: it ends the session the
 * same way. Ctrl-D with text in the answer only deletes a character, as readline does. Only while a question is open:
 * Ctrl-C while a transaction is being sent keeps Node's default, since the node may already have taken it.
 */
async function askInquirer<T>(questions: Questions): Promise<T> {
  // the question's readline, for the answer typed so far; the handler sees a key before readline does
  let readline: { line?: string } | undefined;
  const onKey = (_text: unknown, key: { ctrl?: boolean; name?: string } | undefined): void => {
    if (key?.ctrl !== true) return;
    if (key.name === "c" || (key.name === "d" && readline?.line === "")) {
      process.stdout.write("\x1b[?25h\n"); // the cursor back, which a list question hides
      process.exit(CANCELLED_EXIT_CODE);
    }
  };
  process.stdin.on("keypress", onKey);
  try {
    const answer = inquirer.prompt(questions);
    readline = (answer as unknown as { ui?: { rl?: { line?: string } } }).ui?.rl; // rl is protected in the typings
    return (await answer) as T;
  } finally {
    process.stdin.off("keypress", onKey);
  }
}

async function input(message: string, options: InputOptions = {}): Promise<string> {
  const { answer } = await askInquirer<{ answer: string }>([{ type: "input", name: "answer", message, ...options }]);
  return answer;
}

async function select<T>(message: string, choices: Choice<T>[]): Promise<T> {
  const { answer } = await askInquirer<{ answer: T }>([{ type: "list", name: "answer", message, choices }]);
  return answer;
}

/** A yes/no question; the default is no. */
async function confirm(message: string): Promise<boolean> {
  const { answer } = await askInquirer<{ answer: boolean }>([
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

  nodeId: async (): Promise<string> =>
    parseNodeId(
      await input(askWithHint("Enter NodeId", "(E.g. NodeID-FQKTLuZHEsjCxPeFTFgsojsucmdyNDsz1)"), {
        validate: (value) => validationOf(() => parseNodeId(value)),
      })
    ),

  unixTime: (timeType: string): Promise<string> =>
    input(
      askWithHint(`Enter ${timeType} time`, "(unix seconds, e.g. 1693185095, or a duration from now such as 2d12h)"),
      { validate: validateEndTime }
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

  // after the summary of a built transaction; No, the default, signs and sends nothing
  confirmSigning: (): Promise<boolean> => confirm(ask("Sign and send this transaction?")),

  // a typed C-chain fee below the cost at the current base fee; No asks for the fee again
  confirmLowFee: (): Promise<boolean> => confirm(ask("Send with this fee anyway?")),

  selectNetwork: (): Promise<NetworkName> =>
    select(ask("Which network do you want to connect to?"), choicesOf(networkConstants)),

  selectTask: (): Promise<TaskId> => select(ask("What do you want to do?"), choicesOf(taskConstants)),

  selectAddress: <T>(choices: Choice<T>[]): Promise<T> => select(ask("Which address do you want to use?"), choices),

  // the default in the hint, not as inquirer's default: an empty answer stays empty, and the caller applies it
  delegationFee: (): Promise<string> =>
    input(askWithHint("Enter delegation fee", `(E.g. 10; Enter accepts ${DEFAULT_DELEGATION_FEE_PERCENT}%)`), {
      validate: validateDelegationFee,
    }),

  importTrxType: (): Promise<"P" | "C"> =>
    select(ask("Please select the destination chain to which you want to import your funds?"), [
      { name: "P", value: "P" },
      { name: "C", value: "C" },
    ]),

  popBLSPublicKey: (): Promise<string> =>
    input(ask("Please enter the popBLSPublicKey:"), {
      validate: (value) => validationOf(() => parseBlsHex(value, "publicKey")),
    }),

  // the signature must be the proof of possession of the key entered before it
  popBLSSignature: (publicKey: string): Promise<string> =>
    input(ask("Please enter the popBLSSignature:"), {
      validate: (value) =>
        validationOf(() =>
          checkProofOfPossession(parseBlsHex(publicKey, "publicKey"), parseBlsHex(value, "signature"))
        ),
    }),

  transferAddress: (hrp: string): Promise<string> =>
    input(ask("Enter destination P-chain address:"), {
      validate: (value) => validationOf(() => pChainAddressBytes(value, hrp)),
    }),

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
