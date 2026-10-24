import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261024100000_telegram_link_bot_id_cleanup/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = readFileSync(
  new URL('../../../scripts/rollback-telegram-link-bot-id.sql', import.meta.url),
  'utf8',
);
describe('RF-2003: migration and safe schema rollback', () => {
  it('cleans only active legacy links, backfills bot identity and emits transactional events', async () => {
    const prisma = new PrismaClient();
    const schema = `wt_c_${randomUUID().replaceAll('-', '')}`;
    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        for (const sql of [
          'CREATE TABLE telegram_links (id uuid PRIMARY KEY, owner_id uuid NOT NULL, deleted_at timestamptz)',
          'CREATE TABLE telegram_bot_configuration (owner_id uuid, bot_id text)',
          'CREATE TABLE outbox_events (id uuid, owner_id uuid, type text, actor_kind text, actor_id uuid, data jsonb)',
          'CREATE TABLE activity_log (id uuid, owner_id uuid, actor_id uuid, entity_type text, entity_id uuid, action text, changes jsonb, updated_at timestamptz)',
        ])
          await tx.$executeRawUnsafe(sql);
        const legacy = randomUUID(),
          configured = randomUUID();
        await tx.$executeRaw`INSERT INTO telegram_links VALUES (${randomUUID()}::uuid, ${legacy}::uuid, NULL), (${randomUUID()}::uuid, ${configured}::uuid, NULL), (${randomUUID()}::uuid, ${legacy}::uuid, '2020-01-01'::timestamptz)`;
        await tx.$executeRaw`INSERT INTO telegram_bot_configuration VALUES (${configured}::uuid, '42')`;
        for (const sql of migration.split(';').filter((part) => part.trim()))
          await tx.$executeRawUnsafe(sql);
        const links = await tx.$queryRaw<
          { owner_id: string; bot_id: string | null; deleted_at: Date | null }[]
        >`SELECT * FROM telegram_links`;
        expect(links.find((row) => row.owner_id === configured)).toMatchObject({
          bot_id: '42',
          deleted_at: null,
        });
        expect(
          links.filter((row) => row.owner_id === legacy).every((row) => row.deleted_at !== null),
        ).toBe(true);
        const events = await tx.$queryRaw<{ type: string }[]>`SELECT * FROM outbox_events`;
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe('telegram.legacy_unlinked@v1');
        for (const sql of rollback.split(';').filter((part) => part.trim()))
          await tx.$executeRawUnsafe(sql);
        const columns = await tx.$queryRaw<
          { column_name: string }[]
        >`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'telegram_links'`;
        expect(columns.map((row) => row.column_name)).not.toContain('bot_id');
        const active = await tx.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM telegram_links WHERE owner_id = ${legacy}::uuid AND deleted_at IS NULL`;
        expect(active[0]?.count).toBe(0n);
      });
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    }
  });
});
