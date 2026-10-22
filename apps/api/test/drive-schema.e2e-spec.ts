import { PrismaClient } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { loadRootEnv } from '../src/load-env.js';
loadRootEnv();
const db = new PrismaClient();
afterAll(() => db.$disconnect());
it('TTD-AUD-99 attachment schema stores metadata without local keys or binary columns', async () => {
  const columns = await db.$queryRaw<
    { column_name: string; data_type: string }[]
  >`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='attachments'`;
  expect(columns.map((column) => column.column_name)).not.toEqual(
    expect.arrayContaining(['storage_key', 'thumbnail_key']),
  );
  expect(columns.map((column) => column.column_name)).not.toContain('storage_key');
  expect(columns.map((column) => column.column_name)).not.toContain('thumbnail_key');
  expect(columns.some((column) => column.data_type === 'bytea')).toBe(false);
  expect(columns.map((column) => column.column_name)).toEqual(
    expect.arrayContaining([
      'drive_file_id',
      'web_view_link',
      'icon_link',
      'drive_folder_id',
      'source',
    ]),
  );
});
