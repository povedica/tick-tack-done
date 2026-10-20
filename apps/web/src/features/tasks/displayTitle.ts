/** Strips #hashtags from a title so chips and aria-labels stay clean (TSK-4, TSK-6). */
export function displayTitle(title: string, tagNames: readonly string[] = []): string {
  let text = title;
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`#${escaped}\\b`, 'gi'), ' ');
  }
  // Drop any remaining hashtag tokens (imported titles without linked tags).
  text = text.replace(/(^|\s)#[\p{L}\p{N}_/-]+/gu, ' ');
  return text.replace(/\s{2,}/g, ' ').trim();
}

/** True when a suggestion label looks like a raw UUID (EXT-9 guardrail). */
export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
