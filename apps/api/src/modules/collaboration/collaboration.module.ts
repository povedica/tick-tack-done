import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { CollaborationController } from './collaboration.controller.js';
import { CollaborationService } from './collaboration.service.js';
import { ListAccessService } from './list-access.js';

@Module({
  imports: [AuthModule],
  controllers: [CollaborationController],
  providers: [CollaborationService, ListAccessService],
  exports: [CollaborationService, ListAccessService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class CollaborationModule {}
