import { Module } from '@nestjs/common';
import { AutomationEngine, AutomationsController } from './automations.controller';

@Module({
  controllers: [AutomationsController],
  providers: [AutomationEngine],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AutomationsModule {}
