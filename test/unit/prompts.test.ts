/**
 * The checks interactive prompts run on an answer before accepting it: a refused answer shows the message and the
 * question is asked again, instead of failing the action after the remaining questions.
 */
import { expect } from "chai";
import inquirer from "inquirer";
import { stripVTControlCharacters } from "util";
import {
  CANCELLED_EXIT_CODE,
  prompts,
  validateDelegationFee,
  validateEndTime,
  withCancelNotice,
} from "../../src/interactive/prompts";

describe("interactive prompt checks", () => {
  it("delegation fee: a percentage from 0 to 100, an empty answer for the default 20%", () => {
    for (const fee of ["", "0", "10", "12.5", "100"]) {
      expect(validateDelegationFee(fee), fee).to.equal(true);
    }
    for (const fee of ["10%", "abc", "-1", "1,5"]) {
      expect(validateDelegationFee(fee), fee)
        .to.be.a("string")
        .and.match(/^Invalid/);
    }
    expect(validateDelegationFee("101")).to.equal('Invalid percentage "101": must be between 0 and 100');
  });

  it("end time: unix seconds or a duration from now, a past time included (it gets a warning)", () => {
    for (const time of ["1800000000", "1209600", "2d12h", "90m"]) {
      expect(validateEndTime(time), time).to.equal(true);
    }
    for (const time of ["", "tomorrow", "2d-1h", "8640000000001"]) {
      expect(validateEndTime(time), time)
        .to.be.a("string")
        .and.match(/^Invalid/);
    }
  });

  it("the end time and delegation fee prompts run these checks, with no inquirer default", async () => {
    const asked: { validate?: unknown; default?: unknown }[] = [];
    const original = inquirer.prompt;
    Object.assign(inquirer, {
      prompt: (questions: { validate?: unknown; default?: unknown }[]) => {
        asked.push(...questions);
        return Promise.resolve({ answer: "" });
      },
    });
    try {
      await prompts.unixTime("end");
      await prompts.delegationFee();
    } finally {
      Object.assign(inquirer, { prompt: original });
    }
    expect(asked.map((question) => question.validate)).to.deep.equal([validateEndTime, validateDelegationFee]);
    expect(asked.map((question) => question.default)).to.deep.equal([undefined, undefined]); // empty stays empty
  });

  it("the C-chain fee prompt takes a typed fee of at most 10 FLR, and the estimate it offers whatever it is", async () => {
    const validates: ((value: string) => true | string)[] = [];
    const original = inquirer.prompt;
    Object.assign(inquirer, {
      prompt: (questions: { validate?: (value: string) => true | string }[]) => {
        validates.push(questions[0]!.validate!);
        return Promise.resolve({ answer: "" });
      },
    });
    try {
      await prompts.fees("0.011", "LFLR");
      await prompts.fees("12", "LFLR"); // a base fee spike: the estimate is above what may be typed
      await prompts.fees(undefined, "LFLR");
    } finally {
      Object.assign(inquirer, { prompt: original });
    }
    for (const validate of validates) {
      expect(validate("")).to.equal(true);
      expect(validate("10")).to.equal(true);
      expect(validate("10.000000001")).to.match(/^Invalid fee "10.000000001": at most 10 FLR/);
      expect(validate("1000")).to.match(/^Invalid fee "1000": at most 10 FLR/);
      expect(validate("0")).to.match(/^Invalid amount "0": must be more than 0/);
    }
    expect(validates[1]!("12")).to.equal(true);
    expect(validates[0]!("12")).to.match(/^Invalid fee "12"/);
  });

  it("the transfer address prompt checks the address against the session's network", async () => {
    let validate: ((value: string) => true | string) | undefined;
    const original = inquirer.prompt;
    Object.assign(inquirer, {
      prompt: (questions: { validate?: (value: string) => true | string }[]) => {
        validate = questions[0]!.validate;
        return Promise.resolve({ answer: "" });
      },
    });
    try {
      await prompts.transferAddress("costwo");
    } finally {
      Object.assign(inquirer, { prompt: original });
    }
    expect(validate!("P-costwo18jma8ppw3nhx5r4ap8clazz0dps7rv5uee8qg8")).to.equal(true);
    expect(validate!("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v")).to.match(
      /is an address of localflare, not of this network \(costwo\)/
    );
  });

  it("Ctrl-C at an open question exits with 130, and the key handler is gone once the question is answered", async () => {
    const before = process.stdin.listenerCount("keypress");
    const exits: unknown[] = [];
    let whileAsking = 0;
    const original = {
      prompt: inquirer.prompt,
      exit: process.exit.bind(process),
      write: process.stdout.write.bind(process.stdout),
    };
    Object.assign(inquirer, {
      prompt: () => {
        whileAsking = process.stdin.listenerCount("keypress");
        process.stdin.emit("keypress", "c", { name: "c" }); // a plain c: nothing
        process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" });
        return Promise.resolve({ answer: "" });
      },
    });
    process.exit = ((code?: number) => {
      exits.push(code);
    }) as typeof process.exit;
    process.stdout.write = () => true;
    try {
      await prompts.delegationFee();
    } finally {
      Object.assign(inquirer, { prompt: original.prompt });
      process.exit = original.exit;
      process.stdout.write = original.write;
    }
    expect(CANCELLED_EXIT_CODE).to.equal(130);
    expect(exits).to.deep.equal([130]);
    expect(whileAsking).to.equal(before + 1);
    expect(process.stdin.listenerCount("keypress")).to.equal(before);
  });

  it("Ctrl-C prints the notice of the steps it cancels, and none once they are done, failed or not", async () => {
    const printed: string[] = [];
    const original = {
      prompt: inquirer.prompt,
      exit: process.exit.bind(process),
      write: process.stdout.write.bind(process.stdout),
      log: console.log,
    };
    Object.assign(inquirer, {
      prompt: () => {
        process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" });
        return Promise.resolve({ answer: "" });
      },
    });
    process.exit = ((code?: number) => {
      printed.push(`exit ${code}`);
    }) as typeof process.exit;
    process.stdout.write = () => true;
    console.log = (message: unknown) => printed.push(String(message));
    const cancelled = async (): Promise<string[]> => {
      printed.length = 0;
      await prompts.delegationFee();
      return printed.map((line) => stripVTControlCharacters(line));
    };
    try {
      expect(await withCancelNotice("move 1", cancelled)).to.deep.equal(["move 1", "exit 130"]);
      expect(await cancelled(), "after the steps").to.deep.equal(["exit 130"]);
      await withCancelNotice("move 2", () => Promise.reject(new Error("import failed"))).catch(() => undefined);
      expect(await cancelled(), "after steps that failed").to.deep.equal(["exit 130"]);
      const nested = await withCancelNotice("outer", async () => [
        ...(await withCancelNotice("inner", cancelled)),
        ...(await cancelled()),
      ]);
      expect(nested).to.deep.equal(["inner", "exit 130", "outer", "exit 130"]);
    } finally {
      Object.assign(inquirer, { prompt: original.prompt });
      process.exit = original.exit;
      process.stdout.write = original.write;
      console.log = original.log;
    }
  });

  it("Ctrl-D on an empty answer ends the session like Ctrl-C; with text typed it only deletes, as in readline", async () => {
    const exits: unknown[] = [];
    const original = {
      prompt: inquirer.prompt,
      exit: process.exit.bind(process),
      write: process.stdout.write.bind(process.stdout),
    };
    process.exit = ((code?: number) => {
      exits.push(code);
    }) as typeof process.exit;
    process.stdout.write = () => true;
    try {
      for (const [typed, expected] of [
        ["", [130]], // readline would close: the end of input
        ["half an answer", []],
      ] as const) {
        exits.length = 0;
        Object.assign(inquirer, {
          // the key comes while the question is open, as from the terminal
          prompt: () =>
            Object.assign(
              new Promise((resolve) =>
                setImmediate(() => {
                  process.stdin.emit("keypress", "\x04", { ctrl: true, name: "d" });
                  resolve({ answer: "" });
                })
              ),
              { ui: { rl: { line: typed } } }
            ),
        });
        await prompts.delegationFee();
        expect(exits, JSON.stringify(typed)).to.deep.equal(expected);
      }
    } finally {
      Object.assign(inquirer, { prompt: original.prompt });
      process.exit = original.exit;
      process.stdout.write = original.write;
    }
  });
});
