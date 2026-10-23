import type { Tx } from './tx.js';
/** Serialize series closure and scheduler materialization for one owner. */
export async function lockRecurrenceSeries(
  tx: Tx,
  ownerId: string,
  seriesId: string,
): Promise<void> {
  const key = `recurrence-series:${ownerId}:${seriesId}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
