import type { PrismaClient } from '@prisma/client';

/** RF-PR-14. Deletes used or expired reset tokens older than seven days, 1000 per pass. */
export async function purgePasswordResetTokens(
  db: PrismaClient,
  now: Date,
  limit = 1000,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.passwordResetToken.findMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
    select: { id: true },
    take: limit,
  });
  if (rows.length === 0) {
    return 0;
  }
  const removed = await db.passwordResetToken.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return removed.count;
}
