import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRootEnv } from '../src/load-env.js';

loadRootEnv();

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('section 5 schema', () => {
  it('creates tasks and the indexes Prisma cannot model in the schema', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tasks'
    `;
    expect(tables).toHaveLength(1);

    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE indexname IN (
        'tasks_due_date_active_idx',
        'tasks_fts_idx',
        'projects_one_inbox_per_owner_idx'
      )
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      'projects_one_inbox_per_owner_idx',
      'tasks_due_date_active_idx',
      'tasks_fts_idx',
    ]);
  });
});
