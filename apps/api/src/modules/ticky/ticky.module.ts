import { Module } from '@nestjs/common';
import { TickyController } from './ticky.controller.js';
import { TickyService } from './ticky.service.js';

@Module({
  controllers: [TickyController],
  providers: [TickyService],
  exports: [TickyService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class TickyModule {}
