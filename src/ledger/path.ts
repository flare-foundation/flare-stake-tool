/**
 * BIP-32 derivation paths, checked before any Ledger app library reads one. They read indices differently:
 * hw-app-eth uses parseInt, so `m/44'/60'/0'/0/1O` (letter O) is account 1 in the Ethereum app and refused by the
 * Flare and Avalanche apps, and `1e1` is 1 there and 10 in the others. How many indices a path has stays with each
 * app: the Flare app takes 4 to 6, the Avalanche app signs hashes with 5 (`splitAvalanchePath`), the Ethereum app
 * takes any number.
 */

/** Hardened indices start here; an index is below it, hardened or not. */
const HARDENED_OFFSET = 2 ** 31;

/** The path as given, or an error naming where it came from (`source`, such as `--derivation-path`). */
export function checkDerivationPath(path: string, source: string): string {
  const [root, ...indices] = path.split("/");
  const valid =
    root === "m" &&
    indices.length > 0 &&
    indices.every((index) => /^\d+'?$/.test(index) && Number(index.replace("'", "")) < HARDENED_OFFSET);
  if (!valid) {
    throw new Error(
      `Invalid derivation path "${path}" (${source}): expected m/ and decimal indices below 2^31, each optionally ` +
        "hardened with ', such as m/44'/60'/0'/0/0"
    );
  }
  return path;
}
