import { Module } from '@nestjs/common';
import { FiltersController } from './filters.controller.js';
import { FiltersService } from './filters.service.js';
import { SmartListsController } from './smart-lists.controller.js';
import { SmartListsService } from './smart-lists.service.js';

@Module({
  controllers: [FiltersController, SmartListsController],
  providers: [FiltersService, SmartListsService],
  exports: [FiltersService, SmartListsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class FiltersModule {}
