import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { BackupsService } from './backups.service.js';

let directory: string | undefined;
const previous = process.env.BACKUP_DIR;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  if (previous === undefined) delete process.env.BACKUP_DIR;
  else process.env.BACKUP_DIR = previous;
});

it('TTD-AUD-99: backup listing counts database metadata only and ignores legacy binaries', async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'r80-backups-'));
  process.env.BACKUP_DIR = directory;
  const folder = path.join(directory, '20261022T120000Z');
  await mkdir(folder);
  await writeFile(path.join(folder, 'db.sql.gz'), 'database');
  await writeFile(path.join(folder, 'attachments.tar.gz'), 'legacy binary archive');
  const result = await new BackupsService().list();
  expect(result.items).toEqual([
    {
      stamp: '20261022T120000Z',
      bytes: 8,
      has_database: true,
      attachments_metadata_only: true,
    },
  ]);
});
