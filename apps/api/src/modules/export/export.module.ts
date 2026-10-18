import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  controllers: [ExportController, BackupsController],
  providers: [ExportService, BackupsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ExportModule {}
