/**
 * The checks interactive prompts run on an answer before accepting it: a refused answer shows the message and the
 * question is asked again, instead of failing the action after the remaining questions.
 */
import { expect } from "chai";
import inquirer from "inquirer";
import { CANCELLED_EXIT_CODE, prompts, validateDelegationFee, validateEndTime } from "../../src/interactive/prompts";

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
});
