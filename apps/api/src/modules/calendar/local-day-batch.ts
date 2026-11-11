/** Rows rewritten per pass. F4 acceptance is batches of 500. */
export const LOCAL_DAY_BATCH = 500;

const WRITE_ATTEMPTS = 5;

export interface LocalDayColumns {
  readonly localStartDay: Date | null;
  readonly localEndDay: Date | null;
}

interface StoredLocalDays {
  readonly updatedAt: Date;
  readonly localStartDay: Date | null;
  readonly localEndDay: Date | null;
}

/**
 * Writes local days only when the row still has the `updatedAt` we read.
 * A newer edit wins: we reread it and try again with its own dates.
 */
export async function writeLocalDays<T extends StoredLocalDays>(
  row: T,
  next: LocalDayColumns,
  write: (updatedAt: Date, columns: LocalDayColumns) => Promise<number>,
  reread: () => Promise<T | null>,
  recompute: (row: T) => LocalDayColumns,
): Promise<void> {
  let current: T | null = row;
  let columns = next;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    if (sameLocalDays(current, columns)) {
      return;
    }
    const count = await write(current.updatedAt, columns);
    if (count > 0) {
      return;
    }
    current = await reread();
    if (current === null) {
      return;
    }
    columns = recompute(current);
  }
}

function sameLocalDays(row: StoredLocalDays, columns: LocalDayColumns): boolean {
  return (
    dayKey(row.localStartDay) === dayKey(columns.localStartDay) &&
    dayKey(row.localEndDay) === dayKey(columns.localEndDay)
  );
}

function dayKey(value: Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}
