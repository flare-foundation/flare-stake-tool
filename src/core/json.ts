/** Reading JSON that comes from outside the tool: files people or other tools may have edited, and API answers. */

/** Parses `text`, with an error naming `what` (a file, an answer) instead of a bare SyntaxError. */
export function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${what} is not valid JSON (${error instanceof Error ? error.message : String(error)})`, {
      cause: error,
    });
  }
}

/** A JSON object: not null, not an array. */
export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
