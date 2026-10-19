import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

@Module({
  controllers: [ExportController, BackupsController],
  providers: [ExportService, BackupsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ExportModule {}
