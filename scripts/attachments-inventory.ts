import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
async function volumeBytes(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const nested = await volumeBytes(file);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files++;
      bytes += (await stat(file)).size;
    }
  }
  return { files, bytes };
}
async function main(): Promise<void> {
  if (process.argv.slice(2).join(' ') !== '--dry-run')
    throw new Error('Inventory only supports --dry-run');
  const db = new PrismaClient();
  try {
    const summary = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const columns = await tx.$queryRaw<
        { column_name: string }[]
      >`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='attachments'`;
      const legacy = columns.some((column) => column.column_name === 'storage_key');
      const rows = legacy
        ? await tx.$queryRaw<
            { owner_id: string; bytes: bigint; count: bigint }[]
          >`SELECT owner_id, SUM(byte_size)::bigint AS bytes, COUNT(*)::bigint AS count FROM attachments WHERE storage_key IS NOT NULL AND storage_key <> '' GROUP BY owner_id`
        : [];
      const users = await tx.user.findMany({
        where: {
          id: { in: rows.map((row) => row.owner_id) },
          googleRefreshToken: { not: null },
          googleDriveEnabled: true,
          googleGrantedScopes: { has: 'https://www.googleapis.com/auth/drive.file' },
        },
        select: { id: true },
      });
      const connected = new Set(users.map((user) => user.id));
      return {
        legacy_rows: rows.reduce((sum, row) => sum + Number(row.count), 0),
        legacy_bytes: rows.reduce((sum, row) => sum + Number(row.bytes), 0),
        users_with_google: rows.filter((row) => connected.has(row.owner_id)).length,
        users_without_google: rows.filter((row) => !connected.has(row.owner_id)).length,
      };
    });
    const volume = await volumeBytes(
      process.env.ATTACHMENT_DIR ?? path.join(process.cwd(), 'data', 'attachments'),
    );
    console.log(
      JSON.stringify({
        dry_run: true,
        ...summary,
        volume_files: volume.files,
        volume_bytes: volume.bytes,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error('Attachment inventory failed; no identifying data logged');
  process.exitCode = 1;
});
