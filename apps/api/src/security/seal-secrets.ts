import type { PrismaClient } from '@prisma/client';
import { isSealed, sealField } from './field-cipher.js';

/** Encrypts legacy plaintext secrets already stored in the database (S-08). */
export async function sealStoredSecrets(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ totpSecret: { not: null } }, { googleRefreshToken: { not: null } }],
    },
    select: { id: true, totpSecret: true, googleRefreshToken: true },
  });
  for (const user of users) {
    const totp = sealIfPlain(user.totpSecret);
    const google = sealIfPlain(user.googleRefreshToken);
    if (totp === undefined && google === undefined) {
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(totp === undefined ? {} : { totpSecret: totp }),
        ...(google === undefined ? {} : { googleRefreshToken: google }),
      },
    });
  }
  const hooks = await prisma.webhookEndpoint.findMany({
    select: { id: true, secret: true },
  });
  for (const hook of hooks) {
    if (isSealed(hook.secret)) {
      continue;
    }
    await prisma.webhookEndpoint.update({
      where: { id: hook.id },
      data: { secret: sealField(hook.secret) },
    });
  }
}

function sealIfPlain(value: string | null): string | undefined {
  if (value === null || isSealed(value)) {
    return undefined;
  }
  return sealField(value);
}
