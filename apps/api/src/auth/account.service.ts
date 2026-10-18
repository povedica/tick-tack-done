import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { actorOf, type AuthUser } from './auth-user';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async delete(user: AuthUser, confirmation: string): Promise<void> {
    if (confirmation !== user.email) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'confirmation_required',
        'Confirmation must be the account email',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.accountDeleted,
        entityType: 'user',
        entityId: user.id,
        action: 'deleted',
        data: { user: { id: user.id } },
        previous: null,
      });
      const ownerId = user.id;
      await tx.activityLog.deleteMany({ where: { OR: [{ ownerId }, { actorId: ownerId }] } });
      await tx.outboxEvent.deleteMany({ where: { ownerId } });
      await tx.idempotencyRecord.deleteMany({ where: { ownerId } });
      await tx.personalAccessToken.deleteMany({ where: { ownerId } });
      await tx.reminderDelivery.deleteMany({ where: { ownerId } });
      await tx.seriesAdvance.deleteMany({ where: { ownerId } });
      await tx.checklistItem.deleteMany({ where: { ownerId } });
      await tx.taskTag.deleteMany({ where: { task: { ownerId } } });
      await tx.attachment.deleteMany({ where: { ownerId } });
      await tx.comment.deleteMany({ where: { OR: [{ ownerId }, { authorId: ownerId }] } });
      await tx.focusSession.deleteMany({ where: { ownerId } });
      await tx.stickyNote.deleteMany({ where: { ownerId } });
      await tx.reminder.deleteMany({ where: { ownerId } });
      await tx.task.deleteMany({ where: { ownerId } });
      await tx.habitLog.deleteMany({ where: { ownerId } });
      await tx.habit.deleteMany({ where: { ownerId } });
      await tx.filter.deleteMany({ where: { ownerId } });
      await tx.smartList.deleteMany({ where: { ownerId } });
      await tx.column.deleteMany({ where: { ownerId } });
      await tx.project.deleteMany({ where: { ownerId } });
      await tx.folder.deleteMany({ where: { ownerId } });
      await tx.tag.deleteMany({ where: { ownerId } });
      await tx.externalEvent.deleteMany({ where: { ownerId } });
      await tx.calendarSubscription.deleteMany({ where: { ownerId } });
      await tx.pushSubscription.deleteMany({ where: { ownerId } });
      await tx.countdown.deleteMany({ where: { ownerId } });
      await tx.template.deleteMany({ where: { ownerId } });
      await tx.dashboardLayout.deleteMany({ where: { ownerId } });
      await tx.weeklyReport.deleteMany({ where: { ownerId } });
      await tx.focusSettings.deleteMany({ where: { userId: ownerId } });
      await tx.session.deleteMany({ where: { userId: ownerId } });
      await tx.oauthAuthorizationCode.deleteMany({ where: { userId: ownerId } });
      await tx.oauthClient.deleteMany({ where: { ownerId } });
      await tx.user.delete({ where: { id: ownerId } });
    });
  }
}
