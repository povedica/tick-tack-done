import { Module } from '@nestjs/common';
import { OpenController } from './open.controller.js';

@Module({ controllers: [OpenController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class OpenModule {}
