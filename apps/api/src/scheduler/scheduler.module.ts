import { Module } from '@nestjs/common';
import { CalendarModule } from '../modules/calendar/calendar.module.js';
import { ReminderTransport } from './reminder.transport.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [CalendarModule],
  providers: [SchedulerService, ReminderTransport],
  exports: [SchedulerService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SchedulerModule {}
