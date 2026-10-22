import { googleServiceAccess } from '../integrations/google-access.js';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { DomainBusEvent } from '../events/event-bus.js';
import { EventRouter } from '../events/event-router.js';
import { DomainEvent } from '../events/domain-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { exchangeGoogleRefreshToken } from '../integrations/google-token.js';
import { openField } from '../security/field-cipher.js';
import { DriveClient } from './drive-client.js';
@Injectable()
export class DriveFolderRenamer implements OnModuleInit {
  constructor(
    @Inject(EventRouter) private readonly router: EventRouter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  onModuleInit(): void {
    this.router.subscribe((event) => this.receive(event));
  }
  private async receive(event: DomainBusEvent): Promise<void> {
    if (event.type !== DomainEvent.projectUpdated) return;
    try {
      const stored = await this.prisma.outboxEvent.findFirst({
        where: { id: event.id, ownerId: event.ownerId },
        select: { data: true },
      });
      const data =
        typeof stored?.data === 'object' && stored.data !== null
          ? (stored.data as Record<string, unknown>)
          : {};
      const project =
        typeof data.project === 'object' && data.project !== null
          ? (data.project as Record<string, unknown>)
          : {};
      if (typeof project.id !== 'string' || typeof project.name !== 'string') return;
      const folder = await this.prisma.driveFolder.findFirst({
        where: { userId: event.ownerId, projectId: project.id },
      });
      if (!folder) return;
      const user = await this.prisma.user.findFirst({
        where: { id: event.ownerId, deletedAt: null },
        select: { googleRefreshToken: true, googleStatus: true, googleGrantedScopes:true,googleCalendarEnabled:true,googleDriveEnabled:true },
      });
      if (!googleServiceAccess(user,'drive').connected || !user?.googleRefreshToken) return;
      const client = new DriveClient(
        await exchangeGoogleRefreshToken(openField(user.googleRefreshToken)),
      );
      await client.update(folder.driveFolderId, { name: project.name });
    } catch {
      /* Renaming an external folder must never block a list update. */
    }
  }
}
