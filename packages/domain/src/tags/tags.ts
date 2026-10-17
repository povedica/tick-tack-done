const TAG_NAME_MAX = 100;

export function normalizeTagName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > TAG_NAME_MAX) {
    return null;
  }
  return trimmed;
}

export function tagNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Walks parent links. True when `nextParentId` is `tagId` or a descendant of it. */
export function createsTagCycle(
  tagId: string,
  nextParentId: string | null,
  parentById: ReadonlyMap<string, string | null>,
): boolean {
  if (nextParentId === null) {
    return false;
  }
  let current: string | null = nextParentId;
  const seen = new Set<string>();
  while (current !== null) {
    if (current === tagId || seen.has(current)) {
      return true;
    }
    seen.add(current);
    const parent = parentById.get(current);
    current = parent === undefined ? null : parent;
  }
  return false;
}

/** RF-401: filtering by a parent can include every nested tag. */
export function tagDescendantIds(
  rootId: string,
  childIdsByParent: ReadonlyMap<string, readonly string[]>,
): string[] {
  const result: string[] = [];
  const stack = [...(childIdsByParent.get(rootId) ?? [])];
  const seen = new Set<string>([rootId]);
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) {
      continue;
    }
    seen.add(next);
    result.push(next);
    const children = childIdsByParent.get(next);
    if (children !== undefined) {
      stack.push(...children);
    }
  }
  return result;
}
