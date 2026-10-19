import { Module } from '@nestjs/common';
import { PluginsController } from './plugins.controller.js';

@Module({ controllers: [PluginsController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class PluginsModule {}
