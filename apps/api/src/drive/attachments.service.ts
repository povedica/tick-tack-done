import { googleServiceAccess } from '../integrations/google-access.js';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Attachment } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user.js';
import { actorOf } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainEvent } from '../events/domain-events.js';
import { DomainException } from '../http/domain.exception.js';
import { asJson } from '../http/json.js';
import { openField } from '../security/field-cipher.js';
import { exchangeGoogleRefreshToken } from '../integrations/google-token.js';
import { DriveClient, type DriveFile } from './drive-client.js';
import { signUpload, readUpload } from './upload-token.js';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentPrefix,
  ATTACHMENT_MAX_PER_TASK,
  DRIVE_ATTACHMENT_MAX_BYTES,
  safeFileName,
  acceptedMime,
} from './attachment-limits.js';
export interface DriveAttachmentJson {
  id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  drive_file_id: string;
  web_view_link: string;
  icon_link: string | null;
  source: string;
  drive_state: 'ok' | 'missing' | 'unknown';
  has_thumbnail: boolean;
}
export function driveAttachmentJson(
  row: Attachment,
  state: 'ok' | 'missing' | 'unknown' = 'unknown',
): DriveAttachmentJson {
  return {
    id: row.id,
    file_name: row.fileName,
    mime_type: row.mimeType,
    byte_size: Number(row.byteSize),
    drive_file_id: row.driveFileId,
    web_view_link: row.driveFileId
      ? viewLink({ id: row.driveFileId, webViewLink: row.webViewLink })
      : '',
    icon_link: row.iconLink,
    source: row.source,
    drive_state: state,
    has_thumbnail: false,
  };
}
function viewLink(file: DriveFile): string {
  try {
    const url = new URL(file.webViewLink ?? '');
    if (url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname))
      return url.toString();
  } catch {
    /* Canonical Drive URL below. */
  }
  return `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
}
@Injectable()
export class DriveAttachmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}
  async ownedTask(user: AuthUser, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: user.id, deletedAt: null },
      include: { project: { select: { name: true } } },
    });
    if (!task || (user.listIds !== null && !user.listIds.includes(task.projectId)))
      throw new DomainException(404, 'task_not_found', 'Task was not found');
    return task;
  }
  async assertConnected(user: AuthUser): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true, googleStatus: true, googleGrantedScopes:true,googleCalendarEnabled:true,googleDriveEnabled:true },
    });
    if (!row?.googleRefreshToken)
      throw new DomainException(
        409,
        'drive_not_connected',
        'Connect Google Drive in Settings > Integrations',
        { connect_url: '/settings/integrations' },
      );
    if (row.googleStatus === 'reauth_required')
      throw new DomainException(409, 'drive_reauth_required', 'Reconnect Google Drive', {
        connect_url: '/settings/integrations',
      });
    const access=googleServiceAccess(row,'drive');
    if(!access.authorized || !access.enabled) throw new DomainException(409,access.enabled?'drive_permission_required':'drive_disabled','Authorize or enable Google Drive in Settings > Integrations',{connect_url:'/settings/integrations'});
  }
  private async client(user: AuthUser): Promise<DriveClient> {
    await this.assertConnected(user);
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    });
    try {
      return new DriveClient(
        await exchangeGoogleRefreshToken(openField(row.googleRefreshToken ?? '')),
      );
    } catch (error) {
      if (
        error instanceof DomainException &&
        (error.getResponse() as { code?: string }).code === 'google_reconnect_required'
      ) {
        await this.reauth(user);
        throw new DomainException(409, 'drive_reauth_required', 'Reconnect Google Drive', {
          connect_url: '/settings/integrations',
        });
      }
      throw error;
    }
  }
  private async reauth(user: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, googleStatus: { not: 'reauth_required' } },
        data: { googleStatus: 'reauth_required' },
      });
      if (changed.count)
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.googleReauthRequired,
          entityType: 'user',
          entityId: user.id,
          action: 'updated',
          data: { google_status: 'reauth_required' },
          previous: null,
        });
    });
  }
  private async using<T>(
    user: AuthUser,
    operation: (client: DriveClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.client(user);
    try {
      return await operation(client);
    } catch (error) {
      if (
        error instanceof DomainException &&
        (error.getResponse() as { code?: string }).code === 'drive_reauth_required'
      )
        await this.reauth(user);
      throw error;
    }
  }
  private async quota(user: AuthUser, taskId: string): Promise<void> {
    if (
      (await this.prisma.attachment.count({
        where: { ownerId: user.id, taskId, deletedAt: null },
      })) >= ATTACHMENT_MAX_PER_TASK
    )
      throw new DomainException(413, 'attachment_quota', 'A task can have at most 50 attachments');
  }
  private async folder(user: AuthUser, taskId: string, client: DriveClient): Promise<string> {
    const task = await this.ownedTask(user, taskId);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'drive-folders:' + user.id},0))`;
        const ensure = async (projectId: string | null, name: string, parent: string | null) => {
          const row = await tx.driveFolder.findFirst({ where: { userId: user.id, projectId } });
          if (row) return row.driveFolderId;
          const key = projectId ?? 'root';
          const found = await client.find(
            `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has {key='ttdFolderOwner' and value='${user.id}:${key}'}`,
          );
          const id =
            found[0]?.id ??
            (await client.folder(name, parent, { ttdFolderOwner: `${user.id}:${key}` }));
          await tx.driveFolder.create({ data: { userId: user.id, projectId, driveFolderId: id } });
          return id;
        };
        const root = await ensure(null, 'tick-tack-done', null);
        return ensure(task.projectId, task.project.name, root);
      },
      { timeout: 120000 },
    );
  }
  async startSession(
    user: AuthUser,
    taskId: string,
    input: { name: string; mime_type: string; size: number },
  ): Promise<{ upload_url: string; upload_id: string }> {
    await this.ownedTask(user, taskId);
    await this.assertConnected(user);
    await this.quota(user, taskId);
    if (
      !Number.isSafeInteger(input.size) ||
      input.size <= 0 ||
      input.size > DRIVE_ATTACHMENT_MAX_BYTES
    )
      throw new DomainException(413, 'payload_too_large', 'Direct uploads are limited to 100 MiB');
    const allowed = new Set([
      'text/plain',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]);
    if (!allowed.has(input.mime_type))
      throw new DomainException(415, 'unsupported_media_type', 'File type is not allowed');
    const name = safeFileName(input.name);
    if (name.length === 0)
      throw new DomainException(400, 'validation_failed', 'File name is required');
    return this.using(user, async (client) => {
      const folderId = await this.folder(user, taskId, client);
      const nonce = randomUUID();
      const upload_url = await client.session(
        { name, mimeType: input.mime_type, size: input.size, parent: folderId, uploadId: nonce },
        process.env.PUBLIC_URL ?? 'https://todo.reflexionia.com',
      );
      return {
        upload_url,
        upload_id: signUpload({
          ownerId: user.id,
          taskId,
          folderId,
          nonce,
          name,
          mimeType: input.mime_type,
          size: input.size,
          exp: Date.now() + 3600000,
        }),
      };
    });
  }
  async complete(
    user: AuthUser,
    taskId: string,
    uploadId: string,
    fileId: string,
  ): Promise<DriveAttachmentJson> {
    const ticket = readUpload(uploadId, user.id, taskId);
    await this.ownedTask(user, taskId);
    return this.using(user, async (client) => {
      const file = await client.file(fileId);
      if (
        file.trashed ||
        file.name !== ticket.name ||
        file.mimeType !== ticket.mimeType ||
        Number(file.size) !== ticket.size ||
        !file.parents?.includes(ticket.folderId) ||
        file.appProperties?.ttdUploadId !== ticket.nonce
      )
        throw new DomainException(
          400,
          'drive_upload_mismatch',
          'Drive file does not match the signed upload',
        );
      return this.save(user, taskId, file, 'web', ticket.folderId);
    });
  }
  async link(
    user: AuthUser,
    taskId: string,
    fileId: string,
    source = 'picker',
  ): Promise<DriveAttachmentJson> {
    await this.ownedTask(user, taskId);
    return this.using(user, async (client) => {
      const file = await client.file(fileId);
      if (file.trashed)
        throw new DomainException(404, 'drive_file_not_found', 'The file is no longer in Drive');
      return this.save(user, taskId, file, source, null);
    });
  }
  async stream(
    user: AuthUser,
    taskId: string,
    name: string,
    source: AsyncIterable<Uint8Array>,
    capture = 'api',
  ): Promise<DriveAttachmentJson> {
    await this.ownedTask(user, taskId);
    await this.assertConnected(user);
    await this.quota(user, taskId);
    const buffered = await attachmentPrefix(source);
    try {
      const mime = acceptedMime(buffered.prefix);
      buffered.prefix=Buffer.alloc(0);
      return await this.using(user, async (client) => {
        const folder = await this.folder(user, taskId, client);
        const session = await client.session(
          { name: safeFileName(name), mimeType: mime, parent: folder, uploadId: randomUUID() },
          process.env.PUBLIC_URL ?? 'https://todo.reflexionia.com',
        );
        const uploaded = await client.upload(
          session,
          buffered.replay(),
          ATTACHMENT_MAX_BYTES,
          mime,
        );
        const file = await client.file(uploaded.id);
        if (file.trashed || !file.parents?.includes(folder))
          throw new DomainException(
            502,
            'drive_upload_mismatch',
            'Drive did not confirm the uploaded file',
          );
        return this.save(user, taskId, file, capture, folder);
      });
    } finally {
      await buffered.close();
    }
  }
  private async save(
    user: AuthUser,
    taskId: string,
    file: DriveFile,
    source: string,
    folderId: string | null,
  ): Promise<DriveAttachmentJson> {
    const size = Number(file.size ?? 0);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new DomainException(502, 'drive_invalid_metadata', 'Invalid Drive file size');
    if (size > DRIVE_ATTACHMENT_MAX_BYTES)
      throw new DomainException(
        413,
        'payload_too_large',
        'Attachment exceeds the configured Drive limit',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'task-attachments:' + taskId},0))`;
      const task = await tx.task.findFirst({
        where: { id: taskId, ownerId: user.id, deletedAt: null },
      });
      if (!task) throw new DomainException(404, 'task_not_found', 'Task was not found');
      const existing = await tx.attachment.findFirst({
        where: { ownerId: user.id, taskId, driveFileId: file.id },
      });
      if (existing?.deletedAt === null) return driveAttachmentJson(existing, 'ok');
      if (
        (await tx.attachment.count({ where: { ownerId: user.id, taskId, deletedAt: null } })) >=
        ATTACHMENT_MAX_PER_TASK
      )
        throw new DomainException(
          413,
          'attachment_quota',
          'A task can have at most 50 attachments',
        );
      const data = {
        fileName: file.name ?? 'file',
        mimeType: file.mimeType ?? 'application/octet-stream',
        byteSize: BigInt(size),
        driveFileId: file.id,
        webViewLink: viewLink(file),
        iconLink: file.iconLink ?? null,
        driveFolderId: folderId,
        source,
        deletedAt: null,
      };
      const row = existing
        ? await tx.attachment.update({ where: { id: existing.id }, data })
        : await tx.attachment.create({
            data: { ...data, ownerId: user.id, taskId, uploadedById: user.id },
          });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.driveAttached,
        entityType: 'attachment',
        entityId: row.id,
        action: 'created',
        data: asJson({ task_id: taskId, attachment: driveAttachmentJson(row, 'ok'), source }),
        previous: null,
      });
      return driveAttachmentJson(row, 'ok');
    });
  }
  async list(user: AuthUser, taskId: string): Promise<DriveAttachmentJson[]> {
    await this.ownedTask(user, taskId);
    const rows = await this.prisma.attachment.findMany({
      where: { ownerId: user.id, taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    let client: DriveClient;
    try {
      client = await this.client(user);
    } catch {
      return rows.map((row) => driveAttachmentJson(row));
    }
    return Promise.all(
      rows.map(async (row) => {
        if (!row.driveFileId) return driveAttachmentJson(row);
        try {
          const file = await client.file(row.driveFileId);
          return driveAttachmentJson(row, file.trashed ? 'missing' : 'ok');
        } catch (error) {
          const code =
            error instanceof DomainException ? (error.getResponse() as { code?: string }).code : '';
          if (code === 'drive_reauth_required') await this.reauth(user);
          return driveAttachmentJson(row, code === 'drive_file_not_found' ? 'missing' : 'unknown');
        }
      }),
    );
  }
  private async owned(user: AuthUser, id: string, taskId?: string): Promise<Attachment> {
    const row = await this.prisma.attachment.findFirst({
      where: { id, ownerId: user.id, deletedAt: null, ...(taskId ? { taskId } : {}) },
    });
    if (!row) throw new DomainException(404, 'attachment_not_found', 'Attachment was not found');
    await this.ownedTask(user, row.taskId);
    return row;
  }
  async open(user: AuthUser, id: string, taskId?: string): Promise<string> {
    const row = await this.owned(user, id, taskId);
    const url = driveAttachmentJson(row).web_view_link;
    if (!url)
      throw new DomainException(
        404,
        'drive_file_not_found',
        'The attachment has not been migrated',
      );
    return url;
  }
  async preview(user: AuthUser, id: string): Promise<string> {
    const row = await this.owned(user, id);
    if (!row.driveFileId) throw new DomainException(404, 'thumbnail_not_found', 'No Drive preview');
    return this.using(user, async (client) => {
      const file = await client.file(row.driveFileId, 'thumbnailLink,trashed');
      if (file.trashed || !file.thumbnailLink)
        throw new DomainException(404, 'thumbnail_not_found', 'No Drive preview');
      const url = new URL(file.thumbnailLink);
      if (
        url.protocol !== 'https:' ||
        !(url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.google.com'))
      )
        throw new DomainException(
          502,
          'drive_invalid_preview',
          'Drive returned an invalid preview URL',
        );
      return url.toString();
    });
  }
  async remove(user: AuthUser, taskId: string, id: string, trashInDrive = false): Promise<void> {
    const row = await this.owned(user, id, taskId);
    if (trashInDrive)
      await this.using(user, async (client) => {
        if (row.driveFileId) await client.update(row.driveFileId, { trashed: true });
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.attachmentRemoved,
        entityType: 'attachment',
        entityId: id,
        action: 'deleted',
        data: { task_id: taskId, trash_in_drive: trashInDrive },
        previous: null,
      });
    });
  }
}
