import { Module } from '@nestjs/common';
import { CalendarController, FeedsController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';
import { GoogleSyncService } from './google-sync.service.js';

@Module({
  controllers: [CalendarController, FeedsController],
  providers: [CalendarService, GoogleSyncService],
  exports: [CalendarService, GoogleSyncService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class CalendarModule {}
