import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SearchModule {}
