export const SYNC_PAGE_DEFAULT = 100;
export const SYNC_PAGE_MAX = 200;
export const TOMBSTONE_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** RF-13014. Page size for delta sync. */
export function syncLimit(raw: number | undefined): number | null {
  if (raw === undefined) {
    return SYNC_PAGE_DEFAULT;
  }
  if (!Number.isInteger(raw) || raw < 1 || raw > SYNC_PAGE_MAX) {
    return null;
  }
  return raw;
}

/** RF-13014. Tombstones older than this are no longer returned. */
export function tombstoneCutoff(now: Date): Date {
  return new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * DAY_MS);
}

export function isTombstoneType(type: string): boolean {
  return type.includes('.deleted@');
}
