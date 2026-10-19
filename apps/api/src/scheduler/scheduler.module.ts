import { Module } from '@nestjs/common';
import { ReminderTransport } from './reminder.transport.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [SchedulerService, ReminderTransport],
  exports: [SchedulerService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SchedulerModule {}
