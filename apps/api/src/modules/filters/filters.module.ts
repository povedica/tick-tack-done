import { Module } from '@nestjs/common';
import { FiltersController } from './filters.controller';
import { FiltersService } from './filters.service';
import { SmartListsController } from './smart-lists.controller';
import { SmartListsService } from './smart-lists.service';

@Module({
  controllers: [FiltersController, SmartListsController],
  providers: [FiltersService, SmartListsService],
  exports: [FiltersService, SmartListsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class FiltersModule {}
