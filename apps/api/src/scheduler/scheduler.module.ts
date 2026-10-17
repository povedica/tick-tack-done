import { Module } from '@nestjs/common';
import { ReminderTransport } from './reminder.transport';
import { SchedulerService } from './scheduler.service';

@Module({
  providers: [SchedulerService, ReminderTransport],
  exports: [SchedulerService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SchedulerModule {}
