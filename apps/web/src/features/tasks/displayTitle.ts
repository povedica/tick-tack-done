/** Hides a #tag already shown as a chip so imported titles do not repeat it. */
export function displayTitle(title: string, tagNames: readonly string[]): string {
  let text = title;
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`#${escaped}\\b`, 'gi'), ' ');
  }
  return text.replace(/\s{2,}/g, ' ').trim();
}
