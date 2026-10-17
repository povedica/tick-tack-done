export interface ShareFields {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

/** RF-106. Shared title, text and url become one quick-add draft. */
export function draftFromShare(fields: ShareFields): string {
  return [fields.title, fields.text, fields.url]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

/** The service worker redirects the POST share target to this GET url. */
export function shareTargetRedirect(origin: string, fields: ShareFields): string {
  const params = new URLSearchParams();
  if (fields.title.length > 0) {
    params.set('title', fields.title);
  }
  if (fields.text.length > 0) {
    params.set('text', fields.text);
  }
  if (fields.url.length > 0) {
    params.set('url', fields.url);
  }
  const query = params.toString();
  return query.length === 0 ? `${origin}/quick-add` : `${origin}/quick-add?${query}`;
}
