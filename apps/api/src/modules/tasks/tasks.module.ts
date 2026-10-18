import { Module } from '@nestjs/common';
import { InboundEmailController } from './inbound-email.controller';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController, InboundEmailController],
  providers: [TasksService],
  exports: [TasksService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class TasksModule {}
