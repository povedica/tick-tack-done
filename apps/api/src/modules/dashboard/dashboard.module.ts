import { Module } from '@nestjs/common';
import { ListsModule } from '../lists/lists.module.js';
import { DashboardController } from './dashboard.controller.js';

@Module({ imports: [ListsModule], controllers: [DashboardController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class DashboardModule {}
