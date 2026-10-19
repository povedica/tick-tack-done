import { Module } from '@nestjs/common';
import { FiltersModule } from '../modules/filters/filters.module.js';
import { CountdownsModule } from '../modules/countdowns/countdowns.module.js';
import { HabitsModule } from '../modules/habits/habits.module.js';
import { ListsModule } from '../modules/lists/lists.module.js';
import { SearchModule } from '../modules/search/search.module.js';
import { TagsModule } from '../modules/tags/tags.module.js';
import { TasksModule } from '../modules/tasks/tasks.module.js';
import { McpController } from './mcp.controller.js';
import { McpService } from './mcp.service.js';

@Module({
  imports: [TasksModule, ListsModule, TagsModule, FiltersModule, HabitsModule, CountdownsModule, SearchModule],
  controllers: [McpController],
  providers: [McpService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class McpModule {}
