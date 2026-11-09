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

/**
 * A long option written with one dash and a value, as go-flare's flags may be (`-api-key=KEY`): Commander reads it as
 * the short option `-a` with the value `pi-key=KEY`, and the amount's error printed the key. Refused before parsing,
 * without the value.
 */
function singleDashLongOption(argv: readonly string[]): string | undefined {
  const arg = argv.slice(2).find((a) => /^-[A-Za-z][A-Za-z-]+=/.test(a));
  if (arg === undefined) return undefined;
  const name = arg.slice(1, arg.indexOf("="));
  return `-${name}=***: a long option takes two dashes, as in --${name}=…`;
}

/**
 * `-i <id>` given before a command, as in `-i myid exportCP -a 1`: `-i` there is `interactive`, which takes no
 * arguments, and Commander would report `-a` as unknown. The id goes after the command.
 */
function misplacedTransactionId(argv: readonly string[], index: number): string | undefined {
  const next = index < 0 || argv[index] !== "-i" ? undefined : argv[index + 1];
  if (next === undefined || next.startsWith("-")) return undefined;
  return (
    `-i before a command starts interactive mode, which takes no arguments ("${next}" given); ` +
    "to name a transaction, give -i <id> after the command, as in: exportCP -a 1 -f 0.001 -i myid"
  );
}

const index = commandIndex(process.argv);
const refused = singleDashLongOption(process.argv) ?? misplacedTransactionId(process.argv, index);
if (refused !== undefined) {
  console.error(styleText("red", `Error: ${refused}`));
  process.exit(1);
}

program.parseAsync(expandAliases(process.argv, index)).catch((error: unknown) => {
  console.error(styleText("red", `Error: ${describeError(error)}`));
  process.exit(1);
});
