/**
 * Parses input.
 * @param {string} raw - input
 * @returns {string}
 */
export function parse(raw: string): string | number {
  return raw.length > 1 ? raw : 0;
}
