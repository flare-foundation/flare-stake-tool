import { Command } from "commander";
import { styleText } from "node:util";
import figlet from "figlet";
import { cli } from "./cli";
import { describeError } from "./output";
import { interactiveCli } from "./interactive/cli";
import { ATOMIC_TX_TYPES } from "./core/types";
import { version } from "../package.json";

const INFO_ALIASES = ["addresses", "balance", "validators"];

function banner(): void {
  process.stdout.write("\x1Bc");
  console.log(styleText("white", figlet.textSync("Flare Stake CLI")));
  console.log(styleText("green", `Version: ${version}`));
}

const baseArgv = process.argv;
const program = new Command("flare-stake-tool");
program.version(version);
cli(program);

/**
 * Where the command is in `argv`: the first argument that is neither a program option nor that option's value, so
 * that `--network costwo balance` finds `balance` and `--ctx-file balance addresses` finds `addresses`. -1 when there
 * is none, or when `--version` or an option the program does not know comes first (Commander then prints the
 * version or reports the option).
 */
function commandIndex(argv: readonly string[]): number {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;
    if (!arg.startsWith("-") || arg === "-i") return i;
    const equals = arg.indexOf("=");
    const flag = equals < 0 ? arg : arg.slice(0, equals);
    const option = program.options.find((o) => o.long === flag || o.short === flag);
    if (option === undefined || option.long === "--version") return -1;
    if (option.required && equals < 0) i++; // its value is the next argument
  }
  return -1;
}

/** Lets `exportCP ...` stand for `transaction exportCP ...`, and `balance` for `info balance`, after options too. */
function expandAliases(argv: string[], index: number): string[] {
  const name = index < 0 ? undefined : argv[index];
  if (name === undefined) return argv;
  const group = (ATOMIC_TX_TYPES as readonly string[]).includes(name)
    ? "transaction"
    : INFO_ALIASES.includes(name)
      ? "info"
      : undefined;
  return group === undefined ? argv : [...argv.slice(0, index), group, ...argv.slice(index)];
}

const index = commandIndex(baseArgv);
const command = index < 0 ? undefined : baseArgv[index];

if (command === "interactive" || command === "-i") {
  if (!process.stdin.isTTY) {
    // inquirer reads keystrokes from a terminal; without one it would crash after the first question
    console.error(styleText("red", "Error: interactive mode needs a terminal; use the commands instead (see --help)"));
    process.exit(1);
  }
  banner();
  interactiveCli(baseArgv)
    .then(() => {
      console.log("Finished execution");
    })
    .catch((error: unknown) => {
      console.error(styleText("red", `Error: ${describeError(error)}`));
      process.exit(1);
    });
} else {
  program.parseAsync(expandAliases(baseArgv, index)).catch((error: unknown) => {
    console.error(styleText("red", `Error: ${describeError(error)}`));
    process.exit(1);
  });
}
