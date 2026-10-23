import { DriveFolderRenamer } from './folder-renamer.js';
import { Module } from '@nestjs/common';
import { DriveAttachmentsController } from './attachments.controller.js';
import { DriveAttachmentsService } from './attachments.service.js';
@Module({
  controllers: [DriveAttachmentsController],
  providers: [DriveAttachmentsService, DriveFolderRenamer],
  exports: [DriveAttachmentsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class DriveModule {}
