/**
 * A note sometimes arrives with the two characters "\" and "n" where a line
 * break was meant: an MCP or API client JSON-escaped the string twice.
 * Real line breaks stay untouched, including a literal "\n" written inside a
 * note that already has them. A one-off mention in a single line stays too.
 */
export function normalizeStoredNewlines(value: string): string {
  if (/[\r\n]/.test(value)) {
    return value;
  }
  const breaks = value.match(/\\n/g);
  const structured = value.includes('\\n\\n') || value.includes('\\r\\n') || /\\n[-*]/.test(value);
  if ((breaks === null || breaks.length < 2) && !structured) {
    return value;
  }
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}
