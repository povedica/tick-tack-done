import { Module } from '@nestjs/common';
import { CountdownsController } from './countdowns.controller.js';
import { CountdownsService } from './countdowns.service.js';

@Module({
  controllers: [CountdownsController],
  providers: [CountdownsService],
  exports: [CountdownsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class CountdownsModule {}
