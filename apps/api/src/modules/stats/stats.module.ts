import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller.js';
import { StatsService } from './stats.service.js';

@Module({
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class StatsModule {}
