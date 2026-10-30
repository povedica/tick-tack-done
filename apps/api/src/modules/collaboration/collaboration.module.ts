import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { CollaborationController } from './collaboration.controller.js';
import { CollaborationService } from './collaboration.service.js';
import { PublicLinksController, PublicListsController } from './public-links.controller.js';
import { PublicLinksService } from './public-links.service.js';
import { ListAccessService } from './list-access.js';

@Module({
  imports: [AuthModule],
  controllers: [CollaborationController, PublicLinksController, PublicListsController],
  providers: [CollaborationService, ListAccessService, PublicLinksService],
  exports: [CollaborationService, ListAccessService, PublicLinksService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class CollaborationModule {}
