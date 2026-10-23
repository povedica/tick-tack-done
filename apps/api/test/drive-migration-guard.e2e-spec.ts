import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { loadRootEnv } from '../src/load-env.js';
loadRootEnv();
const db = new PrismaClient();
afterAll(() => db.$disconnect());
it('TTD-AUD-99 schema retirement refuses any remaining local reference', async () => {
  const sql = readFileSync(
    new URL(
      '../prisma/migrations/20261022114218_attachments_drive_only/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const start = sql.indexOf('DO $$');
  expect(start).toBeGreaterThanOrEqual(0);
  const guard = sql.slice(start, sql.indexOf('$$;', start + 5) + 3);
  await expect(
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE attachments (storage_key text, thumbnail_key text, drive_file_id text, drive_url text, task_id uuid) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO attachments (storage_key,drive_file_id,drive_url) VALUES ('legacy-local-key','drive-id','https://drive.google.com/file/d/drive-id/view')",
      );
      await expect(tx.$executeRawUnsafe(guard)).rejects.toThrow(
        /local attachment references remain/,
      );
      throw new Error('rollback synthetic guard fixture');
    }),
  ).rejects.toThrow('rollback synthetic guard fixture');
});
