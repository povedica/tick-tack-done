import { NotificationActionsController } from './notification-actions.controller.js';
import { DriveModule } from '../../drive/drive.module.js';
import { Module } from '@nestjs/common';
import { InboundRateLimiter } from '../../inbound/inbound-rate-limit.js';
import { InboundEmailController } from './inbound-email.controller.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [DriveModule],
  controllers: [TasksController, InboundEmailController, NotificationActionsController],
  providers: [TasksService, InboundRateLimiter],
  exports: [TasksService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class TasksModule {}
