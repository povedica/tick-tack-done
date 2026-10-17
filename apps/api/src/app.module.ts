import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { ListsModule } from './modules/lists/lists.module';
import { TagsModule } from './modules/tags/tags.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';

// Domain modules (tasks, lists, …) register here and do not import each other.
// They publish events through EventsModule; they do not call each other.
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    IdempotencyModule,
    AuthModule,
    HealthModule,
    ListsModule,
    TagsModule,
    TasksModule,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AppModule {}
