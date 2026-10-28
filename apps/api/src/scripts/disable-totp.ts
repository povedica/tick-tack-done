import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../mail/send-email.js';

/**
 * RF-PR D-6. Server-only. There is no HTTP route.
 * Usage: pnpm --filter api admin:disable-totp --email name@example.com
 */
export function assertInteractiveAdmin(tty: boolean): void {
  if (!tty) {
    throw new Error('This command only runs in an interactive shell on the server.');
  }
}

export async function disableTotpAccount(
  prisma: PrismaClient,
  email: string,
): Promise<{ id: string }> {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
    select: { id: true, email: true, locale: true },
  });
  if (user === null) {
    throw new Error('No active account matches that email.');
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    await tx.recoveryCode.deleteMany({ where: { ownerId: user.id } });
    await tx.outboxEvent.create({
      data: {
        ownerId: user.id,
        type: 'totp.disabled@v1',
        actorKind: 'user',
        actorId: user.id,
        data: { user: { id: user.id }, outcome: 'admin_disable_totp' },
      },
    });
    await tx.activityLog.create({
      data: {
        ownerId: user.id,
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        changes: { outcome: 'admin_disable_totp', at: now.toISOString() },
      },
    });
  });
  const english = user.locale.toLowerCase().startsWith('en');
  await sendEmail({
    to: user.email,
    subject: english
      ? 'Two-factor authentication was turned off'
      : 'Se desactivó la verificación en dos pasos',
    text: english
      ? 'An administrator turned off two-factor authentication on your tick-tack-done account. If this was not you, reset your password and contact the operator.'
      : 'Un administrador desactivó la verificación en dos pasos de tu cuenta de tick-tack-done. Si no has sido tú, restablece la contraseña y avisa a quien opera el servicio.',
    idempotencyKey: `admin-disable-totp/${user.id}/${now.toISOString()}`,
  });
  return { id: user.id };
}

function emailArg(argv: readonly string[]): string {
  const flag = argv.indexOf('--email');
  const value = flag >= 0 ? argv[flag + 1] : undefined;
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new Error('Pass --email with the account address.');
  }
  return value;
}

async function main(): Promise<void> {
  assertInteractiveAdmin(input.isTTY && output.isTTY);
  const email = emailArg(process.argv);
  const prompt = createInterface({ input, output });
  const confirmed = await prompt.question('Type the email again to confirm: ');
  prompt.close();
  if (confirmed.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('Confirmation did not match. Nothing was changed.');
  }
  const prisma = new PrismaClient();
  try {
    const result = await disableTotpAccount(prisma, email);
    output.write(`Two-factor authentication is off for ${result.id}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes('disable-totp')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'failed';
    output.write(`${message}\n`);
    process.exitCode = 1;
  });
}
