import { expect } from "chai";
import fc from "fast-check";
import {
  formatDecimal,
  formatDuration,
  formatFlr,
  formatWei,
  MAX_TIME_SECONDS,
  isDurationInput,
  asNFlr,
  asWei,
  parseDecimal,
  parseDuration,
  parseEndTime,
  parseFlr,
  parseFlrToWei,
  parsePercentToShares,
} from "../../src/chain/units";
import type { executorInfo } from "../../src/chain/contracts";
import type { Stake } from "../../src/chain/validators";
import type { TxRequestOf } from "../../src/core/types";

describe("chain/units", () => {
  it("keeps nFLR and wei apart at compile time (`pnpm typecheck` fails if a line below compiles)", () => {
    const nFlr = parseFlr("1");
    const wei = parseFlrToWei("1");
    // @ts-expect-error wei where nFLR is expected
    formatFlr(wei);
    // @ts-expect-error nFLR where wei is expected
    formatWei(nFlr);
    // @ts-expect-error a plain bigint is not an amount until it is marked
    formatFlr(1n);
    // @ts-expect-error a P-chain amount in a C-chain transaction
    const withdrawal: TxRequestOf<"withdrawal">["amount"] = nFlr;
    // @ts-expect-error a C-chain amount in a P-chain transaction
    const transfer: TxRequestOf<"transfer">["amount"] = wei;
    // @ts-expect-error nFLR as an executor fee, which is wei
    const executorFee: Awaited<ReturnType<typeof executorInfo>>["feeWei"] = nFlr;
    // @ts-expect-error wei as a stake amount, which is nFLR
    const staked: Stake["amount"] = wei;
    // at runtime all are plain bigints
    expect([withdrawal, transfer, executorFee, staked]).to.deep.equal([
      1_000_000_000n,
      1_000_000_000_000_000_000n,
      1_000_000_000n,
      1_000_000_000_000_000_000n,
    ]);
  });

  it("formats a negative amount with a leading minus", () => {
    expect(formatDecimal(-1_500_000_000n, 9)).to.equal("-1.5");
    expect(formatFlr(asNFlr(-1n))).to.equal("-0.000000001");
  });

  describe("parseFlr / formatFlr", () => {
    it("keeps the previous decimalToInteger / integerToDecimal semantics", () => {
      expect(parseFlr("0")).to.equal(0n);
      expect(parseFlr("1")).to.equal(1_000_000_000n);
      expect(parseFlr("1.5")).to.equal(1_500_000_000n);
      expect(parseFlr("100000")).to.equal(100_000_000_000_000n);
      expect(parseFlr("0.000000001")).to.equal(1n);
      expect(parseFlr("12.345678901")).to.equal(12_345_678_901n);
      expect(formatFlr(asNFlr(0n))).to.equal("0");
      expect(formatFlr(asNFlr(1_000_000_000n))).to.equal("1");
      expect(formatFlr(asNFlr(1_500_000_000n))).to.equal("1.5");
      expect(formatFlr(asNFlr(123_456_789_012_345n))).to.equal("123456.789012345");
      expect(formatFlr(asNFlr(1n))).to.equal("0.000000001");
    });

    it("refuses more than the chain's uint64 holds, which shifted the later fields of the transaction", () => {
      expect(parseFlr("18446744073.709551615")).to.equal(2n ** 64n - 1n);
      for (const bad of ["18446744073.709551616", "18446744074", "100000000000000000000"]) {
        expect(() => parseFlr(bad), bad).to.throw(
          `Invalid amount "${bad}": at most 18446744073.709551615 (2^64−1 nFLR)`
        );
      }
    });

    it("refuses digits beyond the precision, which up to 4.x were dropped (0.0000000001 became 0)", () => {
      for (const bad of ["1.9999999999", "0.0000000001", "12.3456789012"]) {
        expect(() => parseFlr(bad), bad).to.throw(/Invalid amount .*at most 9 decimal places/);
      }
      expect(parseFlr("1.5000000000")).to.equal(1_500_000_000n); // trailing zeros change nothing
      expect(() => parsePercentToShares("33.33333")).to.throw(/at most 4 decimal places/);
      expect(formatWei(asWei(1_000_000_000_000_000_000n))).to.equal("1");
    });

    it("parses C-chain amounts with the full 18 decimals of wei", () => {
      expect(parseFlrToWei("1.5")).to.equal(1_500_000_000_000_000_000n);
      expect(parseFlrToWei("0.0000000001")).to.equal(100_000_000n);
      expect(parseFlrToWei("4.123456789012345678")).to.equal(4_123_456_789_012_345_678n);
      expect(() => parseFlrToWei("0.0000000000000000001")).to.throw(/at most 18 decimal places/);
      // an amount with up to 9 decimals gives the same wei as the nFLR route used up to 4.x
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 10n ** 20n }), (nFlr) => {
          expect(parseFlrToWei(formatFlr(asNFlr(nFlr)))).to.equal(nFlr * 10n ** 9n);
        })
      );
    });

    it("refuses commas, which up to 4.x were dropped as thousands separators ('1,5' became 15)", () => {
      for (const bad of ["1,5", "0,5", "1,500", "10,000", "1,000.5", "1.000,5", ",5", "1,"]) {
        expect(() => parseFlr(bad), bad).to.throw(/Invalid amount .*commas are not accepted/);
      }
      expect(() => parsePercentToShares("2,5")).to.throw(/commas are not accepted/);
    });

    it("rejects negative, empty and non-numeric input", () => {
      for (const bad of ["", "-1", "1e9", "abc", "1.2.3", "0x10"]) {
        expect(() => parseFlr(bad), bad).to.throw(/Invalid amount/);
      }
    });

    it("round-trips any amount (property)", () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), fc.integer({ min: 0, max: 18 }), (value, decimals) => {
          expect(parseDecimal(formatDecimal(value, decimals), decimals)).to.equal(value);
        })
      );
    });
  });

  describe("parsePercentToShares", () => {
    it("is exact where Number(x) * 1e4 was not", () => {
      expect(parsePercentToShares("20")).to.equal(200_000);
      expect(parsePercentToShares("2.5")).to.equal(25_000);
      expect(parsePercentToShares("0.07")).to.equal(700);
      expect(parsePercentToShares("100")).to.equal(1_000_000);
      expect(parsePercentToShares("0")).to.equal(0);
      expect(Number("0.07") * 1e4).to.not.equal(700); // the float bug this replaces
    });

    it("rejects more than 100 % and malformed input", () => {
      expect(() => parsePercentToShares("100.0001")).to.throw(/between 0 and 100/);
      expect(() => parsePercentToShares("-1")).to.throw(/Invalid amount/);
    });
  });

  describe("parseDuration / formatDuration", () => {
    it("parses seconds and unit sequences", () => {
      expect(parseDuration("900")).to.equal(900n);
      expect(parseDuration("15m")).to.equal(900n);
      expect(parseDuration("2d12h")).to.equal(216_000n);
      expect(parseDuration("1w")).to.equal(604_800n);
      expect(parseDuration("1w2d3h4m5s")).to.equal(604_800n + 172_800n + 10_800n + 240n + 5n);
      expect(parseDuration(" 90m ")).to.equal(5_400n);
    });

    it("refuses to format a negative duration", () => {
      expect(() => formatDuration(-1n)).to.throw("Duration cannot be negative");
    });

    it("rejects ascending order, fractions, unknown units, repeats and empty input", () => {
      for (const bad of ["2h2d", "1.5d", "3mo", "1h1h", "", "d", "2d 12h", "-1d"]) {
        expect(() => parseDuration(bad), bad).to.throw(/Invalid duration/);
        // an end or start time: a plain number is a unix time, so the error doesn't say "use seconds"
        expect(() => parseEndTime(bad), bad).to.throw(
          `Invalid time "${bad}": use a unix time in seconds, or a duration from now such as 2d12h or 90m`
        );
      }
    });

    it("formats canonically and round-trips (property)", () => {
      expect(formatDuration(0n)).to.equal("0s");
      expect(formatDuration(90n)).to.equal("1m30s");
      expect(formatDuration(216_000n)).to.equal("2d12h");
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), (seconds) => {
          expect(parseDuration(formatDuration(seconds))).to.equal(seconds);
        })
      );
    });
  });

  describe("parseEndTime", () => {
    const now = () => 1_700_000_000_000;
    it("passes unix seconds through and adds durations to now", () => {
      expect(parseEndTime("1779484800", now)).to.equal(1_779_484_800n);
      expect(parseEndTime("2d12h", now)).to.equal(1_700_000_000n + 216_000n);
      expect(parseEndTime("20m", now)).to.equal(1_700_001_200n);
      expect(isDurationInput("20m")).to.equal(true);
      expect(isDurationInput("1779484800")).to.equal(false);
    });

    it("refuses a time after the latest date that can be shown, below the chain's uint64 limit", () => {
      expect(parseEndTime(MAX_TIME_SECONDS.toString(), now)).to.equal(MAX_TIME_SECONDS);
      // 2^64 + 5 was serialized in 9 bytes, shifting every later field; 15000000w crashed printing the date
      for (const time of [(MAX_TIME_SECONDS + 1n).toString(), "18446744073709551621", "15000000w"]) {
        expect(() => parseEndTime(time, now), time).to.throw(
          `Invalid time "${time}": after 8640000000000 (year 275760), the latest date that can be shown`
        );
      }
      expect(new Date(Number(MAX_TIME_SECONDS) * 1000).toISOString()).to.equal("+275760-09-13T00:00:00.000Z");
    });
  });

  describe("parseDuration bound", () => {
    it("refuses a duration above the chain's uint64 limit", () => {
      expect(parseDuration("18446744073709551615")).to.equal(2n ** 64n - 1n);
      for (const duration of ["18446744073709551616", "40000000000000w"]) {
        expect(() => parseDuration(duration), duration).to.throw(
          `Invalid duration "${duration}": at most 18446744073709551615 seconds`
        );
      }
    });
  });
});
