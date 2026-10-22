import { createReadStream } from 'node:fs';
import { realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
import { DriveClient } from '../apps/api/src/drive/drive-client';
import { openField } from '../apps/api/src/security/field-cipher';
import { exchangeGoogleRefreshToken } from '../apps/api/src/integrations/google-token';
import { backupBeforeApply, maintenanceMode } from './data-safety';
async function main(): Promise<void> {
  const mode = maintenanceMode();
  const args = process.argv.slice(2);
  const removeLocal = args.includes('--remove-local');
  const purge = args.includes('--purge-unmigrated');
  if ((removeLocal || purge) && !args.includes('--pablo-approved'))
    throw new Error('Physical removal requires explicit Pablo approval (--pablo-approved)');
  if (mode.dryRun && (removeLocal || purge)) throw new Error('Dry-run never removes files');
  const db = new PrismaClient();
  try {
    const columns = await db.$queryRaw<
      { column_name: string }[]
    >`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='attachments'`;
    if (!columns.some((column) => column.column_name === 'storage_key')) {
      console.log(
        JSON.stringify({ dry_run: mode.dryRun, pending: 0, schema_already_retired: true }),
      );
      return;
    }
    type Row = {
      id: string;
      owner_id: string;
      task_id: string;
      storage_key: string;
      thumbnail_key: string | null;
      drive_file_id: string | null;
      file_name: string;
      mime_type: string;
      byte_size: number;
      project_id: string;
      project_name: string;
      google_refresh_token: string | null;
    };
    const rows = await db.$queryRaw<
      Row[]
    >`SELECT a.id,a.owner_id,a.task_id,a.storage_key,a.thumbnail_key,a.drive_file_id,a.file_name,a.mime_type,a.byte_size,t.project_id,p.name AS project_name,u.google_refresh_token FROM attachments a JOIN tasks t ON t.id=a.task_id JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=a.owner_id WHERE a.storage_key IS NOT NULL AND a.storage_key<>'' ORDER BY a.owner_id,a.id`;
    console.log(
      JSON.stringify({
        dry_run: mode.dryRun,
        pending: rows.length,
        with_drive: rows.filter((row) => row.google_refresh_token !== null).length,
        without_drive: rows.filter((row) => row.google_refresh_token === null).length,
        remove_local: removeLocal,
        purge_unmigrated: purge,
      }),
    );
    if (mode.dryRun || rows.length === 0) return;
    backupBeforeApply(mode.backup ?? '');
    const configuredRoot = path.resolve(
      process.env.ATTACHMENT_DIR ?? path.join(process.cwd(), 'data', 'attachments'),
    );
    const root = await realpath(configuredRoot).catch(() => configuredRoot);
    const absolute = async (key: string): Promise<string> => {
      if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/i.test(key))
        throw new Error('Unsafe legacy storage key');
      const resolved = await realpath(path.join(root, key));
      if (!resolved.startsWith(root + path.sep)) throw new Error('Legacy file escapes volume');
      return resolved;
    };
    let migrated = 0;
    let removed = 0;
    let waiting = 0;
    const clients = new Map<string, DriveClient>();
    for (const row of rows) {
      // The old link-only route invented a storage key without ever creating a file.
      if (
        row.mime_type === 'application/vnd.google-apps.drive' &&
        row.byte_size === 0 &&
        row.drive_file_id
      ) {
        const exists = await stat(path.join(root, row.storage_key)).then(
          () => true,
          () => false,
        );
        if (exists)
          throw new Error('Unexpected local data for a legacy Drive link; refusing retirement');
        await db.$executeRaw`UPDATE attachments SET storage_key='',thumbnail_key=NULL,source='picker' WHERE id=${row.id}::uuid AND storage_key=${row.storage_key}`;
        migrated++;
        continue;
      }
      if (row.google_refresh_token === null) {
        if (purge) {
          await unlink(await absolute(row.storage_key));
          if (row.thumbnail_key) await unlink(await absolute(row.thumbnail_key));
          await db.$executeRaw`DELETE FROM attachments WHERE id=${row.id}::uuid AND storage_key=${row.storage_key}`;
          removed++;
        } else waiting++;
        continue;
      }
      let client = clients.get(row.owner_id);
      if (!client) {
        client = new DriveClient(
          await exchangeGoogleRefreshToken(openField(row.google_refresh_token)),
        );
        clients.set(row.owner_id, client);
      }
      const folder = async (
        projectId: string | null,
        name: string,
        parent: string | null,
      ): Promise<string> => {
        const existing = await db.driveFolder.findFirst({
          where: { userId: row.owner_id, projectId },
        });
        if (existing) return existing.driveFolderId;
        const key = projectId ?? 'root';
        const found = await client.find(
          `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has {key='ttdFolderOwner' and value='${row.owner_id}:${key}'}`,
        );
        const id =
          found[0]?.id ??
          (await client.folder(name, parent, { ttdFolderOwner: `${row.owner_id}:${key}` }));
        await db.driveFolder.create({
          data: { userId: row.owner_id, projectId, driveFolderId: id },
        });
        return id;
      };
      const rootId = await folder(null, 'tick-tack-done', null);
      const folderId = await folder(row.project_id, row.project_name, rootId);
      // A crash after Drive accepted the bytes is recovered through the legacy id marker.
      const recovered = (
        await client.find(
          `trashed=false and appProperties has {key='ttdLegacyAttachmentId' and value='${row.id}'}`,
        )
      )[0];
      let file = recovered;
      if (!file) {
        const local = await absolute(row.storage_key);
        const details = await stat(local);
        if (details.size !== row.byte_size)
          throw new Error('Legacy file size differs from metadata');
        const upload = await client.session(
          {
            name: row.file_name,
            mimeType: row.mime_type,
            size: details.size,
            parent: folderId,
            uploadId: row.id,
            legacyId: row.id,
          },
          process.env.PUBLIC_URL ?? 'https://todo.reflexionia.com',
        );
        const uploaded = await client.upload(
          upload,
          createReadStream(local, { highWaterMark: 64 * 1024 }),
          100 * 1024 * 1024,
          row.mime_type,
        );
        file = await client.file(uploaded.id);
      }
      if (file.trashed || Number(file.size) !== row.byte_size || !file.parents?.includes(folderId))
        throw new Error('Drive verification failed; preserving local files');
      const link =
        file.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
      await db.$executeRaw`UPDATE attachments SET drive_file_id=${file.id},drive_url=${link},drive_folder_id=${folderId},icon_link=${file.iconLink ?? null},source='migration' WHERE id=${row.id}::uuid AND owner_id=${row.owner_id}::uuid`;
      migrated++;
      if (removeLocal) {
        // Missing files after an interrupted approved removal are safe once Drive was verified.
        for (const key of [row.storage_key, row.thumbnail_key].filter(
          (value): value is string => value !== null,
        )) {
          try {
            await unlink(await absolute(key));
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
              throw error;
          }
        }
        await db.$executeRaw`UPDATE attachments SET storage_key='',thumbnail_key=NULL WHERE id=${row.id}::uuid AND drive_file_id=${file.id}`;
        removed++;
      }
    }
    console.log(JSON.stringify({ migrated, removed, waiting_for_owner_decision: waiting }));
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Drive migration failed; local files preserved unless explicitly approved and verified; no credentials logged',
  );
  process.exitCode = 1;
});
