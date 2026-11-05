/**
 * Amounts and times at the CLI boundary. Strings come in, bigint goes out:
 * nFLR (9 decimals) on the P-chain, wei (18 decimals) on the C-chain, seconds
 * for durations. No floating point anywhere.
 */
export const NFLR_DECIMALS = 9;
export const WEI_DECIMALS = 18;

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parses a non-negative decimal string into an integer with `decimals`
 * fractional digits. Digits beyond `decimals` are refused unless they are
 * zeros, never cut off. A comma is refused rather than read as a thousands
 * separator: "1,5" may mean 1.5, and "1,500" is ambiguous between 1.5 and 1500
 * even when written in groups of three.
 */
export function parseDecimal(input: string, decimals: number): bigint {
  const cleaned = input.trim();
  if (cleaned.includes(",")) {
    throw new Error(
      `Invalid amount "${input}": commas are not accepted, neither as decimal nor as thousands separator; ` +
        `use "." for decimals, e.g. 1.5 or 10000`
    );
  }
  const match = DECIMAL_RE.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid amount "${input}": expected a non-negative decimal number`);
  }
  const whole = match[1]!;
  const digits = match[2] ?? "";
  if (/[1-9]/.test(digits.slice(decimals))) {
    throw new Error(`Invalid amount "${input}": at most ${decimals} decimal places are supported`);
  }
  const fraction = digits.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole + fraction);
}

/** Inverse of parseDecimal: integer with `decimals` fractional digits → decimal string without trailing zeros. */
export function formatDecimal(value: bigint, decimals: number): string {
  if (value < 0n) {
    return "-" + formatDecimal(-value, decimals);
  }
  const digits = value.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** FLR → nFLR (P-chain and atomic amounts and fees). */
export const parseFlr = (input: string): bigint => parseDecimal(input, NFLR_DECIMALS);
/** FLR → wei (C-chain EVM amounts), with the C-chain's full 18 decimals. */
export const parseFlrToWei = (input: string): bigint => parseDecimal(input, WEI_DECIMALS);
export const formatFlr = (nFlr: bigint): string => formatDecimal(nFlr, NFLR_DECIMALS);
export const formatWei = (wei: bigint): string => formatDecimal(wei, WEI_DECIMALS);
export const nFlrToWei = (nFlr: bigint): bigint => nFlr * 10n ** BigInt(WEI_DECIMALS - NFLR_DECIMALS);

/** One million shares = 100 %; the P-chain expresses delegation fees in millionths. */
export const SHARES_PER_PERCENT = 10_000;

/** "20" → 200000, "2.5" → 25000, "0.07" → 700 (exact, no floating point). */
export function parsePercentToShares(percent: string): number {
  const shares = parseDecimal(percent, 4);
  if (shares > BigInt(100 * SHARES_PER_PERCENT)) {
    throw new Error(`Invalid percentage "${percent}": must be between 0 and 100`);
  }
  return Number(shares);
}

const UNIT_SECONDS: ReadonlyArray<[string, bigint]> = [
  ["w", 7n * 24n * 3600n],
  ["d", 24n * 3600n],
  ["h", 3600n],
  ["m", 60n],
  ["s", 1n],
];
const DURATION_RE = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

/**
 * Parses a duration into seconds. A plain integer is already seconds; otherwise
 * a sequence of `<integer><unit>` with units w, d, h, m (minutes), s in that
 * order, each at most once and without spaces: "900", "15m", "2d12h", "1w".
 */
export function parseDuration(input: string): bigint {
  const text = input.trim();
  if (/^\d+$/.test(text)) {
    return BigInt(text);
  }
  const match = DURATION_RE.exec(text);
  if (text === "" || !match) {
    throw new Error(
      `Invalid duration "${input}": use seconds or units w/d/h/m/s in descending order without spaces, e.g. 2d12h or 90m`
    );
  }
  let seconds = 0n;
  UNIT_SECONDS.forEach(([, unitSeconds], index) => {
    const amount = match[index + 1];
    if (amount !== undefined) {
      seconds += BigInt(amount) * unitSeconds;
    }
  });
  return seconds;
}

/** Canonical form of a duration: "2d12h", "90s" → "1m30s", 0 → "0s". */
export function formatDuration(seconds: bigint): string {
  if (seconds < 0n) {
    throw new Error("Duration cannot be negative");
  }
  if (seconds === 0n) {
    return "0s";
  }
  let remaining = seconds;
  let out = "";
  for (const [unit, unitSeconds] of UNIT_SECONDS) {
    const count = remaining / unitSeconds;
    if (count > 0n) {
      out += `${count}${unit}`;
      remaining -= count * unitSeconds;
    }
  }
  return out;
}

/**
 * An end time is either absolute unix seconds (a plain integer) or a duration
 * added to now. Returns unix seconds.
 */
export function parseEndTime(input: string, nowMs: () => number = () => Date.now()): bigint {
  const text = input.trim();
  if (/^\d+$/.test(text)) {
    return BigInt(text);
  }
  return BigInt(Math.floor(nowMs() / 1000)) + parseDuration(text);
}

export function isDurationInput(input: string): boolean {
  return !/^\d+$/.test(input.trim());
}
