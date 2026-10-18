import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception';

const STAMP = /^\d{8}T\d{6}Z$/;

export interface BackupItem {
  readonly stamp: string;
  readonly bytes: number;
  readonly has_database: boolean;
  readonly has_attachments: boolean;
}

@Injectable()
export class BackupsService {
  async list(): Promise<{ items: BackupItem[]; remote_configured: boolean }> {
    const root = backupDir();
    let names: string[] = [];
    try {
      names = await readdir(root);
    } catch {
      names = [];
    }
    const items: BackupItem[] = [];
    for (const name of names.filter((entry) => STAMP.test(entry)).sort()) {
      const dir = path.join(root, name);
      const info = await stat(dir);
      if (!info.isDirectory()) {
        continue;
      }
      const database = await fileSize(path.join(dir, 'db.sql.gz'));
      const attachments = await fileSize(path.join(dir, 'attachments.tar.gz'));
      items.push({
        stamp: name,
        bytes: database + attachments,
        has_database: database > 0,
        has_attachments: attachments > 0,
      });
    }
    const remote = process.env.BACKUP_REMOTE ?? '';
    const drive = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';
    return { items, remote_configured: remote.length > 0 || drive.length > 0 };
  }

  async restore(
    stamp: string,
    confirmation: string,
  ): Promise<{
    stamp: string;
    verified: boolean;
    applied: boolean;
    detail: string;
  }> {
    if (confirmation !== 'restore') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'confirmation_required',
        'Confirmation must be restore',
      );
    }
    if (!STAMP.test(stamp)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Unknown backup stamp',
      );
    }
    const file = path.join(backupDir(), stamp, 'db.sql.gz');
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch {
      throw new DomainException(HttpStatus.NOT_FOUND, 'backup_not_found', 'Backup was not found');
    }
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'backup_invalid',
        'Backup archive is not gzip',
      );
    }
    return {
      stamp,
      verified: true,
      applied: false,
      detail:
        'Archive verified. Apply it on the host with scripts/restore.sh. The API does not overwrite the live database.',
    };
  }
}

function backupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
}

async function fileSize(file: string): Promise<number> {
  try {
    const info = await stat(file);
    return info.size;
  } catch {
    return 0;
  }
}
