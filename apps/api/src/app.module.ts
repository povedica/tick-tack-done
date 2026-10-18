import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { McpModule } from './mcp/mcp.module';
import { ExportModule } from './modules/export/export.module';
import { FiltersModule } from './modules/filters/filters.module';
import { HabitsModule } from './modules/habits/habits.module';
import { ListsModule } from './modules/lists/lists.module';
import { SearchModule } from './modules/search/search.module';
import { SyncModule } from './modules/sync/sync.module';
import { TagsModule } from './modules/tags/tags.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulerModule } from './scheduler/scheduler.module';

// Domain modules (tasks, lists, …) register here and do not import each other.
// They publish events through EventsModule; they do not call each other.
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    IdempotencyModule,
    AuthModule,
    HealthModule,
    HabitsModule,
    ListsModule,
    FiltersModule,
    SearchModule,
    TagsModule,
    TasksModule,
    SyncModule,
    ExportModule,
    McpModule,
    SchedulerModule,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AppModule {}
