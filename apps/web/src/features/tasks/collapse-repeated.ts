/** DET-5: repair only a whole buffer repeated at least four times.
 * Internal repetitions in an otherwise distinct note must never be deleted.
 * Taking the shortest period makes the repair idempotent.
 */
export function collapseRepeatedContent(value: string): string {
  const text = value.trim();
  if (text.length < 40) return value;
  for (let size = 1; size <= Math.min(4096, Math.floor(text.length / 4)); size += 1) {
    const chunk = text.slice(0, size);
    if (chunk.trim().length < 8) continue;
    if (!text.startsWith(chunk, size)) continue;
    // A trailing space/newline in the repeating unit may have been trimmed.
    const repeats = Math.ceil(text.length / size);
    if (chunk.repeat(repeats).trim() === text) return chunk.trim();
  }
  return value;
}
