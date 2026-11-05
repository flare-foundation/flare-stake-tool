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
const command = baseArgv[2];

/** Lets `flare-stake-tool exportCP ...` stand for `transaction exportCP ...`, and `balance` for `info balance`. */
function expandAliases(argv: string[]): string[] {
  const name = argv[2];
  if (name !== undefined && (ATOMIC_TX_TYPES as readonly string[]).includes(name)) {
    return [...argv.slice(0, 2), "transaction", ...argv.slice(2)];
  }
  if (name !== undefined && INFO_ALIASES.includes(name)) {
    return [...argv.slice(0, 2), "info", ...argv.slice(2)];
  }
  return argv;
}

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
  const program = new Command("flare-stake-tool");
  program.version(version);
  cli(program);
  program.parseAsync(expandAliases(baseArgv)).catch((error: unknown) => {
    console.error(styleText("red", `Error: ${describeError(error)}`));
    process.exit(1);
  });
}
