import type { PrismaService } from '../prisma/prisma.service.js';

export function googleConfigured(): boolean {
  return present('GOOGLE_CLIENT_ID') && present('GOOGLE_CLIENT_SECRET');
}

export async function telegramConfigured(prisma: PrismaService, ownerId: string): Promise<boolean> {
  const { telegramConfiguration } = await import('./telegram-configuration.js');
  return (await telegramConfiguration(prisma, ownerId)).token.trim().length > 0;
}

/** Drive as a backup destination. Without the folder id the API does not call Google. */
export function driveConfigured(): boolean {
  return googleConfigured() && present('GOOGLE_DRIVE_FOLDER_ID');
}

function present(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}
