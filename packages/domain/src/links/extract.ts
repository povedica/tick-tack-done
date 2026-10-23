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
    const value = match[0];
    const pairs: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
    const counts: Record<string, number> = {};
    for (const character of value)
      if ('()[]{}'.includes(character)) counts[character] = (counts[character] ?? 0) + 1;
    let end = value.length;
    while (end > 0) {
      const tail = value[end - 1] ?? '';
      if ('.,;:!?'.includes(tail)) {
        end--;
        continue;
      }
      const open = pairs[tail];
      if (open && (counts[tail] ?? 0) > (counts[open] ?? 0)) {
        counts[tail] = (counts[tail] ?? 0) - 1;
        end--;
        continue;
      }
      break;
    }
    const raw = value.slice(0, end);
    const url = normalizeTaskUrl(raw);
    if (url !== null) urls.add(url);
  }
  return [...urls];
}
