import type { FilterCondition, FilterRules } from '../types';

/** Stored tag references are UUIDs. Anything else is a name from an older client. */
const TAG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TagRef {
  readonly id: string;
  readonly name: string;
}

export function isFilterTagId(value: string): boolean {
  return TAG_ID.test(value);
}

/** Split a tag condition into ids the owner already saved and names still waiting for a backfill. */
export function partitionTagValues(values: readonly string[]): {
  readonly ids: readonly string[];
  readonly legacyNames: readonly string[];
} {
  const ids: string[] = [];
  const legacyNames: string[] = [];
  for (const value of values) {
    if (isFilterTagId(value)) {
      ids.push(value);
    } else {
      legacyNames.push(value);
    }
  }
  return { ids, legacyNames };
}

/**
 * A UUID must belong to the owner. A name matches an active tag without regard to case.
 * Returns the canonical id, or null when nothing matches.
 */
export function resolveTagReference(value: string, tags: readonly TagRef[]): string | null {
  if (isFilterTagId(value)) {
    const wanted = value.toLowerCase();
    return tags.find((tag) => tag.id.toLowerCase() === wanted)?.id ?? null;
  }
  const wanted = value.toLocaleLowerCase();
  return tags.find((tag) => tag.name.toLocaleLowerCase() === wanted)?.id ?? null;
}

/** Point every saved reference of `sourceId` at `targetId`, dropping duplicates in the same condition. */
export function rewriteMergedTag(
  rules: FilterRules,
  sourceId: string,
  targetId: string,
): { readonly rules: FilterRules; readonly changed: boolean } {
  let changed = false;
  const groups = rules.groups.map((group) => ({
    combinator: group.combinator,
    conditions: group.conditions.map((condition) => rewriteCondition(condition)),
  }));
  return { rules: { combinator: rules.combinator, groups }, changed };

  function rewriteCondition(condition: FilterCondition): FilterCondition {
    if (condition.field !== 'tag') {
      return condition;
    }
    const source = sourceId.toLowerCase();
    const next: string[] = [];
    let sawTarget = false;
    for (const value of condition.value) {
      if (value.toLowerCase() === source) {
        changed = true;
        if (!sawTarget && !next.some((item) => item.toLowerCase() === targetId.toLowerCase())) {
          next.push(targetId);
          sawTarget = true;
        }
        continue;
      }
      if (value.toLowerCase() === targetId.toLowerCase()) {
        sawTarget = true;
      }
      if (!next.some((item) => item.toLowerCase() === value.toLowerCase())) {
        next.push(value);
      }
    }
    return next.length === condition.value.length &&
      next.every((value, index) => value === condition.value[index])
      ? condition
      : { field: 'tag', op: 'any_of', value: next };
  }
}
