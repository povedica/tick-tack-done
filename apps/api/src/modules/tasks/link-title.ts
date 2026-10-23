import { safeFetch } from '../../security/safe-fetch.js';
/** Optional metadata only: failure never prevents storing an otherwise valid URL. */
export async function linkTitle(url: string): Promise<string | null> {
  if (!/^https?:/i.test(url)) return null;
  try {
    const response = await safeFetch(url, {
      maxBytes: 256 * 1024,
      timeoutMs: 3000,
      maxRedirects: 3,
      contentType: 'text/html',
      allowHttp: true,
    });
    if (response.status !== 200) return null;
    const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(response.body.toString('utf8'))?.[1];
    // A title is RCDATA, and consumers render it as text. Decode once; do not try to sanitize HTML with regexes.
    const entities: Readonly<Record<string, string>> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      '#39': "'",
    };
    const title =
      raw
        ?.replace(/&(amp|lt|gt|quot|#39);/g, (_match, key: string) => entities[key] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200) ?? '';
    return title.length ? title : null;
  } catch {
    return null;
  }
}
