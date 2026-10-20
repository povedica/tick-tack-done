import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class MetricsModule {}
