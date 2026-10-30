import type { PrismaClient } from '@prisma/client';

/** RF-1801. A pending invite older than its expiry no longer occupies a seat. */
export async function expireShareInvitations(prisma: PrismaClient, now: Date): Promise<number> {
  const result = await prisma.projectMember.updateMany({
    where: {
      status: 'pending',
      deletedAt: null,
      expiresAt: { lte: now },
    },
    data: { status: 'revoked', deletedAt: now },
  });
  return result.count;
}
