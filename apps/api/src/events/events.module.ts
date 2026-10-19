import { Global, Module } from '@nestjs/common';
import { BullMqEventBus } from './bullmq-bus.js';
import { EventRecorder } from './event-recorder.js';
import { EventRouter } from './event-router.js';
import { OutboxPublisher } from './outbox-publisher.js';

@Global()
@Module({
  providers: [EventRecorder, EventRouter, BullMqEventBus, OutboxPublisher],
  exports: [EventRecorder, EventRouter, BullMqEventBus, OutboxPublisher],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class EventsModule {}
