import { Module } from '@nestjs/common';
import { PlanningModule } from '../modules/planning/planning.module.js';
import { CalendarModule } from '../modules/calendar/calendar.module.js';
import { ReminderTransport } from './reminder.transport.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [CalendarModule, PlanningModule],
  providers: [SchedulerService, ReminderTransport],
  exports: [SchedulerService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SchedulerModule {}
