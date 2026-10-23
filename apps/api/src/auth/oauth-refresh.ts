import type { Tx } from '../prisma/tx.js';

export const OAUTH_REFRESH_GRACE_MS = 60_000;
export const OAUTH_ACCESS_OVERLAP_MS = 120_000;

export type RefreshDisposition = 'rotate' | 'replay' | 'reuse' | 'expired' | 'unknown';

export function classifyRefresh(
  row: {
    readonly rotatedAt: Date | null;
    readonly revokedAt: Date | null;
    readonly expiresAt: Date;
  } | null,
  now: Date,
): RefreshDisposition {
  if (row === null) {
    return 'unknown';
  }
  if (row.revokedAt !== null) return 'reuse';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (row.rotatedAt !== null) {
    const elapsed = now.getTime() - row.rotatedAt.getTime();
    return elapsed >= 0 && elapsed <= OAUTH_REFRESH_GRACE_MS ? 'replay' : 'reuse';
  }
  return 'rotate';
}

/** Revokes every refresh token in the family and returns the access-token ids in that chain. */
export async function revokeRefreshFamily(
  tx: Tx,
  familyId: string,
  now: Date,
): Promise<readonly string[]> {
  const rows = await tx.oauthRefreshToken.findMany({
    where: { familyId },
    select: { accessTokenId: true },
  });
  await tx.oauthRefreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
  return [...new Set(rows.map((row) => row.accessTokenId))];
}

/** Revokes refresh chains that issued this access token, plus sibling access tokens. */
export async function revokeRefreshChainsForAccess(
  tx: Tx,
  accessTokenId: string,
  now: Date,
): Promise<readonly string[]> {
  const links = await tx.oauthRefreshToken.findMany({
    where: { accessTokenId },
    select: { familyId: true },
  });
  const families = [...new Set(links.map((link) => link.familyId))];
  const accessIds: string[] = [];
  for (const familyId of families) {
    accessIds.push(...(await revokeRefreshFamily(tx, familyId, now)));
  }
  const extra = [...new Set(accessIds)].filter((id) => id !== accessTokenId);
  if (extra.length > 0) {
    await tx.personalAccessToken.updateMany({
      where: { id: { in: extra }, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  return extra;
}

/** Serialize application revocation with refresh issuance for the same owner/client. */
export async function lockOauthGrant(tx: Tx, ownerId: string, clientId: string): Promise<void> {
  const key = `oauth-grant:${ownerId}:${clientId}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
