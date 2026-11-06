import { Command } from "commander";
import { styleText } from "node:util";
import { cli } from "./cli";
import { describeError } from "./output";
import { ATOMIC_TX_TYPES } from "./core/types";
import { version } from "../package.json";

const INFO_ALIASES = ["addresses", "balance", "validators"];

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

/**
 * Lets `exportCP ...` stand for `transaction exportCP ...`, `balance` for `info balance` and `-i` for `interactive`,
 * after options too.
 */
function expandAliases(argv: string[], index: number): string[] {
  const name = index < 0 ? undefined : argv[index];
  if (name === undefined) return argv;
  if (name === "-i") return [...argv.slice(0, index), "interactive", ...argv.slice(index + 1)];
  const group = (ATOMIC_TX_TYPES as readonly string[]).includes(name)
    ? "transaction"
    : INFO_ALIASES.includes(name)
      ? "info"
      : undefined;
  return group === undefined ? argv : [...argv.slice(0, index), group, ...argv.slice(index)];
}

program.parseAsync(expandAliases(process.argv, commandIndex(process.argv))).catch((error: unknown) => {
  console.error(styleText("red", `Error: ${describeError(error)}`));
  process.exit(1);
});
