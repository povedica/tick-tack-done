import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { AccountExtraModule } from './modules/account-extra/account-extra.module.js';
import { AutomationsModule } from './modules/automations/automations.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { CountdownsModule } from './modules/countdowns/countdowns.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ExportModule } from './modules/export/export.module.js';
import { FocusModule } from './modules/focus/focus.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { PlanningModule } from './modules/planning/planning.module.js';
import { PluginsModule } from './modules/plugins/plugins.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ReviewModule } from './modules/review/review.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { TransferModule } from './modules/transfer/transfer.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { OpenModule } from './open/open.module.js';
import { FiltersModule } from './modules/filters/filters.module.js';
import { HabitsModule } from './modules/habits/habits.module.js';
import { ListsModule } from './modules/lists/lists.module.js';
import { MatrixModule } from './modules/matrix/matrix.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { TickyModule } from './modules/ticky/ticky.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';

// Domain modules (tasks, lists, …) register here and do not import each other.
// They publish events through EventsModule; they do not call each other.
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    IdempotencyModule,
    AuthModule,
    HealthModule,
    CountdownsModule,
    HabitsModule,
    ListsModule,
    MatrixModule,
    FiltersModule,
    SearchModule,
    TagsModule,
    TasksModule,
    TickyModule,
    SyncModule,
    ExportModule,
    McpModule,
    SchedulerModule,
    CalendarModule,
    MetricsModule,
    DashboardModule,
    ReportsModule,
    StatsModule,
    ReviewModule,
    PlanningModule,
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
