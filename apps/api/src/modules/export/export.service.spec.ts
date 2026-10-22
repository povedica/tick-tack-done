import { expect, it, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ExportService } from './export.service.js';

it('TTD-AUD-99: JSON exports select only public attachment metadata', async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const taskFind = vi
    .fn()
    .mockImplementation(({ include }: { include: Record<string, unknown> }) => {
      expect(include.attachments).toEqual({
        where: { deletedAt: null },
        select: {
          driveFileId: true,
          fileName: true,
          mimeType: true,
          byteSize: true,
          webViewLink: true,
        },
      });
      return [
        {
          id: 'task',
          attachments: [
            {
              driveFileId: 'file',
              fileName: 'a.txt',
              mimeType: 'text/plain',
              byteSize: 12n,
              webViewLink: 'https://drive.google.com/file/d/file/view',
            },
          ],
        },
      ];
    });
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
    folder: { findMany },
    project: { findMany },
    tag: { findMany },
    task: { findMany: taskFind },
    habit: { findMany },
    filter: { findMany },
    smartList: { findMany },
  } as unknown as PrismaService;
  const result = await new ExportService(prisma).json({ id: 'owner' } as AuthUser);
  expect(result.tasks).toEqual([
    {
      id: 'task',
      attachments: [
        {
          drive_file_id: 'file',
          file_name: 'a.txt',
          mime_type: 'text/plain',
          byte_size: 12,
          web_view_link: 'https://drive.google.com/file/d/file/view',
        },
      ],
    },
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /storage_key|thumbnail_key|refresh_token|access_token/,
  );
});
