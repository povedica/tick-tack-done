import { Module } from '@nestjs/common';
import { WebhookDispatcher, WebhooksController } from './webhooks.controller';

@Module({
  controllers: [WebhooksController],
  providers: [WebhookDispatcher],
  exports: [WebhookDispatcher],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class WebhooksModule {}
