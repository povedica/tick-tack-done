import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { PlanningController, PlansController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

@Module({
  imports: [TasksModule],
  controllers: [PlanningController, PlansController],
  providers: [PlanningService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class PlanningModule {}
