/**
 * DET-5: collapses a description that accidentally repeated the same chunk many times
 * (autosave / sync bug). Keeps the first occurrence when a block repeats ≥ 4 times.
 */
export function collapseRepeatedContent(value: string): string {
  const text = value.trim();
  if (text.length < 40) {
    return value;
  }
  for (let size = Math.min(120, Math.floor(text.length / 4)); size >= 12; size -= 1) {
    const chunk = text.slice(0, size);
    if (chunk.trim().length < 8) {
      continue;
    }
    const escaped = chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const repeats = text.match(new RegExp(`(?:${escaped})+`, 'g'));
    const longest = repeats?.sort((left, right) => right.length - left.length)[0];
    if (longest !== undefined && longest.length >= chunk.length * 4) {
      return text.replace(longest, chunk);
    }
  }
  return value;
}
