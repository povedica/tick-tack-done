import { Module } from '@nestjs/common';
import { LocalDayQueue } from './local-day-queue.js';

@Module({
  providers: [LocalDayQueue],
  exports: [LocalDayQueue],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class LocalDayModule {}
