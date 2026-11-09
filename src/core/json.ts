/** Reading JSON that comes from outside the tool: files people or other tools may have edited, and API answers. */

/**
 * A message without the text V8's JSON.parse errors quote from their input (`Unexpected token 'd', "d133724945"... is
 * not valid JSON` becomes `Unexpected token 'd' in JSON`): the first characters of a raw key file given as a context
 * file, or of a node's answer that starts with the API key, which masking no longer matches once V8 has cut it.
 */
export const withoutQuotedInput = (message: string): string =>
  message.replace(
    /(Unexpected token '[\s\S]+?'), (?:\.\.\.)?"[\s\S]*?"(?:\s*\.\.\.)? is not valid JSON/g,
    "$1 in JSON"
  );

/** Parses `text`, with an error naming `what` (a file, an answer) instead of a bare SyntaxError. */
export function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = withoutQuotedInput(error instanceof Error ? error.message : String(error));
    throw new Error(`${what} is not valid JSON (${reason})`, { cause: error });
  }
}

/** A JSON object: not null, not an array. */
export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
