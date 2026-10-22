// WHATWG URL is available in browsers and Node. Keep the domain free of runtime imports.
declare const URL: new (input: string) => {
  protocol: string;
  username: string;
  password: string;
  pathname: string;
  toString(): string;
};
/** TTD-AUD-100 / RF-201: URL normalization without network access. */
export function normalizeTaskUrl(raw: string): string | null {
  try {
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password)
      return null;
    if (url.protocol === 'mailto:' && !url.pathname.includes('@')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(/(?:https?:\/\/|www\.|mailto:)[^\s<>"']+/gi)) {
    let raw = match[0].replace(/[.,;:!?]+$/, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ] as const) {
      while (raw.endsWith(close) && raw.split(close).length > raw.split(open).length)
        raw = raw.slice(0, -1);
    }
    raw = raw.replace(/[.,;:!?]+$/, '');
    const url = normalizeTaskUrl(raw);
    if (url !== null) urls.add(url);
  }
  return [...urls];
}
