/**
 * Amounts and times at the CLI boundary. Strings come in, bigint goes out:
 * nFLR (9 decimals, `NFlr`) on the P-chain, wei (18 decimals, `Wei`) on the
 * C-chain, seconds for durations. No floating point anywhere.
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

declare const unit: unique symbol;
/**
 * An amount in nFLR (9 decimals): P-chain and atomic amounts and fees. A plain bigint at runtime; the brand only
 * keeps the compiler from mixing it with wei, which is 10^9 times smaller.
 */
export type NFlr = bigint & { readonly [unit]: "nFLR" };
/** An amount in wei (18 decimals): C-chain EVM amounts. */
export type Wei = bigint & { readonly [unit]: "wei" };

/** Marks a bigint known to be nFLR, such as a value read from the P-chain or flarejs. */
export const asNFlr = (value: bigint): NFlr => value as NFlr;
/** Marks a bigint known to be wei, such as a value read from the C-chain. */
export const asWei = (value: bigint): Wei => value as Wei;

/**
 * Amounts, times and durations are uint64 on the P-chain and in atomic transactions: flarejs writes a larger value
 * in more bytes, which shifts every later field.
 */
export const UINT64_MAX = 2n ** 64n - 1n;

/** FLR → nFLR (P-chain and atomic amounts and fees), at most 2^64−1 nFLR. */
export function parseFlr(input: string): NFlr {
  const amount = parseDecimal(input, NFLR_DECIMALS);
  if (amount > UINT64_MAX) {
    throw new Error(`Invalid amount "${input}": at most ${formatDecimal(UINT64_MAX, NFLR_DECIMALS)} (2^64−1 nFLR)`);
  }
  return asNFlr(amount);
}
/** FLR → wei (C-chain EVM amounts), with the C-chain's full 18 decimals. */
export const parseFlrToWei = (input: string): Wei => asWei(parseDecimal(input, WEI_DECIMALS));
export const formatFlr = (amount: NFlr): string => formatDecimal(amount, NFLR_DECIMALS);
export const formatWei = (amount: Wei): string => formatDecimal(amount, WEI_DECIMALS);
export const nFlrToWei = (amount: NFlr): Wei => asWei(amount * 10n ** BigInt(WEI_DECIMALS - NFLR_DECIMALS));

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

/** The latest time a JavaScript Date can show (year 275760); far below UINT64_MAX, so it bounds times for both. */
export const MAX_TIME_SECONDS = 8_640_000_000_000n;

/**
 * Parses a duration into seconds. A plain integer is already seconds; otherwise
 * a sequence of `<integer><unit>` with units w, d, h, m (minutes), s in that
 * order, each at most once and without spaces: "900", "15m", "2d12h", "1w".
 */
export function parseDuration(input: string): bigint {
  const seconds = durationSeconds(input);
  if (seconds > UINT64_MAX) {
    throw new Error(`Invalid duration "${input}": at most ${UINT64_MAX} seconds`);
  }
  return seconds;
}

function durationSeconds(input: string): bigint {
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
 * added to now. Returns unix seconds, at most MAX_TIME_SECONDS.
 */
export function parseEndTime(input: string, nowMs: () => number = () => Date.now()): bigint {
  const text = input.trim();
  const time = /^\d+$/.test(text) ? BigInt(text) : BigInt(Math.floor(nowMs() / 1000)) + parseDuration(text);
  if (time > MAX_TIME_SECONDS) {
    throw new Error(
      `Invalid time "${input}": after ${MAX_TIME_SECONDS} (year 275760), the latest date that can be shown`
    );
  }
  return time;
}

export function isDurationInput(input: string): boolean {
  return !/^\d+$/.test(input.trim());
}
