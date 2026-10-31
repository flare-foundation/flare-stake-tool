import { expect } from "chai";
import fc from "fast-check";
import {
  formatDecimal,
  formatDuration,
  formatFlr,
  formatWei,
  isDurationInput,
  nFlrToWei,
  parseDecimal,
  parseDuration,
  parseEndTime,
  parseFlr,
  parsePercentToShares,
} from "../../src/chain/units";

describe("chain/units", () => {
  describe("parseFlr / formatFlr", () => {
    it("keeps the previous decimalToInteger / integerToDecimal semantics", () => {
      expect(parseFlr("0")).to.equal(0n);
      expect(parseFlr("1")).to.equal(1_000_000_000n);
      expect(parseFlr("1.5")).to.equal(1_500_000_000n);
      expect(parseFlr("100000")).to.equal(100_000_000_000_000n);
      expect(parseFlr("0.000000001")).to.equal(1n);
      expect(parseFlr("12.3456789012")).to.equal(12_345_678_901n);
      expect(formatFlr(0n)).to.equal("0");
      expect(formatFlr(1_000_000_000n)).to.equal("1");
      expect(formatFlr(1_500_000_000n)).to.equal("1.5");
      expect(formatFlr(123_456_789_012_345n)).to.equal("123456.789012345");
      expect(formatFlr(1n)).to.equal("0.000000001");
    });

    it("truncates beyond the precision and ignores thousands separators", () => {
      expect(parseFlr("1.9999999999")).to.equal(1_999_999_999n);
      expect(parseFlr("10,000")).to.equal(10_000_000_000_000n);
      expect(formatWei(1_000_000_000_000_000_000n)).to.equal("1");
      expect(nFlrToWei(1_500_000_000n)).to.equal(1_500_000_000_000_000_000n);
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

    it("rejects ascending order, fractions, unknown units, repeats and empty input", () => {
      for (const bad of ["2h2d", "1.5d", "3mo", "1h1h", "", "d", "2d 12h", "-1d"]) {
        expect(() => parseDuration(bad), bad).to.throw(/Invalid duration/);
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
  });
});
