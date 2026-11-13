export function sourceSelected(value: string | null, id: string): boolean {
  return value === null || value.split(',').includes(id);
}

/** Null means every source. Membership is Set.has, equivalent to split().includes. */
export function sourceSet(value: string | null): Set<string> | null {
  if (value === null) {
    return null;
  }
  return new Set(value.split(','));
}

export function toggleSource(
  value: string | null,
  id: string,
  available: readonly string[],
): string | null {
  const selected = new Set(available.filter((item) => sourceSelected(value, item)));
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  if (available.every((item) => selected.has(item))) return null;
  return selected.size ? [...selected].join(',') : '-';
}
