import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';

@Module({ controllers: [DashboardController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class DashboardModule {}
