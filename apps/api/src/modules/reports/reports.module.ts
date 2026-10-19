import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';

@Module({ controllers: [ReportsController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ReportsModule {}
