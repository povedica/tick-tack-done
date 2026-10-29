/**
 * Replace leftover tag names in saved filters with the owner's tag id.
 * Unresolved names stay as they are, so evaluation can still use them.
 *
 * Dry run first:
 *   pnpm --filter api exec tsx ../../scripts/backfill-filter-tag-ids.ts --dry-run
 *
 * Does not print names, titles or rule contents. Do not point it at production
 * until the dry run count looks right.
 */
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
import {
  isFilterTagId,
  parseFilterRules,
  resolveTagReference,
  type TagRef,
} from '../packages/domain/src/filters/index';
import type { FilterRules } from '../packages/domain/src/types';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    throw new Error('DATABASE_URL is required');
  }
  const db = new PrismaClient();
  try {
    const filters = await db.filter.findMany({
      where: { deletedAt: null },
      select: { id: true, ownerId: true, mode: true, rules: true },
    });
    const tags = await db.tag.findMany({
      where: { deletedAt: null },
      select: { id: true, ownerId: true, name: true },
    });
    const byOwner = new Map<string, TagRef[]>();
    for (const tag of tags) {
      const list = byOwner.get(tag.ownerId) ?? [];
      list.push({ id: tag.id, name: tag.name });
      byOwner.set(tag.ownerId, list);
    }
    let updated = 0;
    let unresolved = 0;
    let skipped = 0;
    for (const filter of filters) {
      const parsed = parseFilterRules(filter.rules, filter.mode);
      if (!parsed.ok) {
        skipped += 1;
        continue;
      }
      const next = replaceNames(parsed.rules, byOwner.get(filter.ownerId) ?? []);
      unresolved += next.unresolved;
      if (!next.changed) {
        continue;
      }
      updated += 1;
      if (!dryRun) {
        await db.filter.update({ where: { id: filter.id }, data: { rules: next.rules } });
      }
    }
    console.log(
      JSON.stringify({
        dry_run: dryRun,
        scanned: filters.length,
        updated,
        unresolved,
        skipped,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

function replaceNames(
  rules: FilterRules,
  tags: readonly TagRef[],
): { readonly rules: FilterRules; readonly changed: boolean; readonly unresolved: number } {
  let changed = false;
  let unresolved = 0;
  const groups = rules.groups.map((group) => ({
    combinator: group.combinator,
    conditions: group.conditions.map((condition) => {
      if (condition.field !== 'tag') {
        return condition;
      }
      const value: string[] = [];
      for (const item of condition.value) {
        const resolved = storedTagId(item, tags);
        if (resolved === null) {
          unresolved += 1;
          value.push(item);
          continue;
        }
        if (resolved !== item) {
          changed = true;
        }
        if (!value.some((existing) => existing.toLowerCase() === resolved.toLowerCase())) {
          value.push(resolved);
        } else if (resolved !== item) {
          changed = true;
        }
      }
      return { field: 'tag' as const, op: 'any_of' as const, value };
    }),
  }));
  return { rules: { combinator: rules.combinator, groups }, changed, unresolved };
}

function storedTagId(value: string, tags: readonly TagRef[]): string | null {
  if (isFilterTagId(value)) {
    const wanted = value.toLowerCase();
    return tags.find((tag) => tag.id.toLowerCase() === wanted)?.id ?? value;
  }
  return resolveTagReference(value, tags);
}

void main();
