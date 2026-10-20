import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { DayClosingController } from './day-closing.controller.js';
import { DayClosingService } from './day-closing.service.js';
import { PlanningController, PlansController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

@Module({
  imports: [TasksModule],
  controllers: [PlanningController, PlansController, DayClosingController],
  providers: [PlanningService, DayClosingService],
  exports: [DayClosingService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class PlanningModule {}
