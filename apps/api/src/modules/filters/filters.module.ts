import { Module } from '@nestjs/common';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { FilterTagMergeListener } from './filter-tag-merge.listener.js';
import { FiltersController } from './filters.controller.js';
import { FiltersService } from './filters.service.js';
import { SmartListsController } from './smart-lists.controller.js';
import { SmartListsService } from './smart-lists.service.js';

@Module({
  imports: [CollaborationModule],
  controllers: [FiltersController, SmartListsController],
  providers: [FiltersService, SmartListsService, FilterTagMergeListener],
  exports: [FiltersService, SmartListsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class FiltersModule {}
