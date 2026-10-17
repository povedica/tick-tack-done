import { Module } from '@nestjs/common';

// Un módulo por dominio (sección 4): tasks, lists, tags, filters, habits, focus, notes,
// calendar, reminders, search, sync, dashboard, reports, review, import-export, auth,
// mcp, webhooks, automations. Los módulos no se importan entre sí: publican/consumen eventos.
@Module({
  imports: [],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- shell until domain modules land
export class AppModule {}
