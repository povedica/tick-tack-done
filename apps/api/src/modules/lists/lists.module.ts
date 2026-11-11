import { Module } from '@nestjs/common';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';
import { ProjectsOverviewService } from './projects-overview.service.js';

@Module({
  imports: [CollaborationModule],
  controllers: [ListsController],
  providers: [ListsService, ProjectsOverviewService],
  exports: [ListsService, ProjectsOverviewService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ListsModule {}
