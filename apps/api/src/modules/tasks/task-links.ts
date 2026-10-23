import { extractUrls } from '@reflexionia/domain';
import type { TaskLink } from '@prisma/client';
import type { Tx } from '../../prisma/tx.js';

export async function reconcileTaskLinks(tx: Tx, ownerId: string, taskId: string, text: string) {
  const urls = extractUrls(text);
  await tx.taskLink.deleteMany({
    where: { ownerId, taskId, source: 'auto', url: { notIn: urls } },
  });
  if (urls.length)
    await tx.taskLink.createMany({
      data: urls.map((url) => ({ ownerId, taskId, url, source: 'auto' })),
      skipDuplicates: true,
    });
}
export function taskLinkJson(row: TaskLink) {
  return {
    id: row.id,
    task_id: row.taskId,
    url: row.url,
    title: row.title,
    source: row.source,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
