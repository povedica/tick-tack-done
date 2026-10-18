import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { McpModule } from './mcp/mcp.module';
import { AccountExtraModule } from './modules/account-extra/account-extra.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExportModule } from './modules/export/export.module';
import { FocusModule } from './modules/focus/focus.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { NotesModule } from './modules/notes/notes.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ReviewModule } from './modules/review/review.module';
import { TransferModule } from './modules/transfer/transfer.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { OpenModule } from './open/open.module';
import { FiltersModule } from './modules/filters/filters.module';
import { HabitsModule } from './modules/habits/habits.module';
import { ListsModule } from './modules/lists/lists.module';
import { MatrixModule } from './modules/matrix/matrix.module';
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
    MatrixModule,
    FiltersModule,
    SearchModule,
    TagsModule,
    TasksModule,
    SyncModule,
    ExportModule,
    McpModule,
    SchedulerModule,
    CalendarModule,
    DashboardModule,
    ReportsModule,
    ReviewModule,
    WebhooksModule,
    AutomationsModule,
    RealtimeModule,
    FocusModule,
    CollaborationModule,
    PluginsModule,
    NotesModule,
    TransferModule,
    IntegrationsModule,
    AccountExtraModule,
    OpenModule,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AppModule {}
