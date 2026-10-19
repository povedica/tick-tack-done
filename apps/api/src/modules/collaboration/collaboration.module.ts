import { Module } from '@nestjs/common';
import { CollaborationController } from './collaboration.controller.js';

@Module({ controllers: [CollaborationController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class CollaborationModule {}
