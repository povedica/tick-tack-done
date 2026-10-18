import { Module } from '@nestjs/common';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';

@Module({
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ListsModule {}
