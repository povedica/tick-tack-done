import { Global, Module } from '@nestjs/common';
import { BullMqEventBus } from './bullmq-bus';
import { EventRecorder } from './event-recorder';
import { EventRouter } from './event-router';
import { OutboxPublisher } from './outbox-publisher';

@Global()
@Module({
  providers: [EventRecorder, EventRouter, BullMqEventBus, OutboxPublisher],
  exports: [EventRecorder, EventRouter, BullMqEventBus, OutboxPublisher],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class EventsModule {}
