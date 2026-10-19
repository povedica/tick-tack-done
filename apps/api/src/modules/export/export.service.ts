import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildExportDocument, type ExportDocument } from './export-document.js';

@Injectable()
export class ExportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async json(user: AuthUser): Promise<ExportDocument> {
    const ownerId = user.id;
    const [profile, folders, projects, tags, tasks, habits, filters, smartLists] =
      await Promise.all([
        this.prisma.user.findFirst({
          where: { id: ownerId },
          select: {
            id: true,
            email: true,
            displayName: true,
            timeZone: true,
            locale: true,
            weekStart: true,
            dateFormat: true,
            theme: true,
            createdAt: true,
          },
        }),
        this.prisma.folder.findMany({ where: { ownerId } }),
        this.prisma.project.findMany({ where: { ownerId } }),
        this.prisma.tag.findMany({ where: { ownerId } }),
        this.prisma.task.findMany({ where: { ownerId }, include: { checklist: true, tags: true } }),
        this.prisma.habit.findMany({ where: { ownerId }, include: { logs: true } }),
        this.prisma.filter.findMany({ where: { ownerId } }),
        this.prisma.smartList.findMany({ where: { ownerId } }),
      ]);
    return buildExportDocument(new Date().toISOString(), {
      user: profile === null ? { id: ownerId } : jsonSafe(profile),
      folders: folders.map(jsonSafe),
      projects: projects.map(jsonSafe),
      tags: tags.map(jsonSafe),
      tasks: tasks.map(jsonSafe),
      habits: habits.map(jsonSafe),
      filters: filters.map(jsonSafe),
      smart_lists: smartLists.map(jsonSafe),
    });
  }
}

function jsonSafe(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as Record<string, unknown>;
}
