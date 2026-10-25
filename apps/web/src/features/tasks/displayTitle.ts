/** Capture settings decide which tokens are removed; render the persisted title faithfully. */
export function displayTitle(title: string, _tagNames: readonly string[] = []): string {
  return title.replace(/\s{2,}/g, ' ').trim();
}

/** True when a suggestion label looks like a raw UUID (EXT-9 guardrail). */
export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
