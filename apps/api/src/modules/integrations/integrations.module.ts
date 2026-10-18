import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';

@Module({ controllers: [IntegrationsController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class IntegrationsModule {}
