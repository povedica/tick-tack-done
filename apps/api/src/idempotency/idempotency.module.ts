import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service.js';

@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class IdempotencyModule {}
