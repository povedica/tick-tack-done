import { Module } from '@nestjs/common';
import { FiltersModule } from '../modules/filters/filters.module';
import { HabitsModule } from '../modules/habits/habits.module';
import { ListsModule } from '../modules/lists/lists.module';
import { SearchModule } from '../modules/search/search.module';
import { TagsModule } from '../modules/tags/tags.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [TasksModule, ListsModule, TagsModule, FiltersModule, HabitsModule, SearchModule],
  controllers: [McpController],
  providers: [McpService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class McpModule {}
