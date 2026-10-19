import { Module } from '@nestjs/common';
import { HabitsController } from './habits.controller.js';
import { HabitsService } from './habits.service.js';

@Module({
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class HabitsModule {}
