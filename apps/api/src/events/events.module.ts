import { Global, Module } from '@nestjs/common';
import { BullMqEventBus } from './bullmq-bus';
import { EventRecorder } from './event-recorder';
import { OutboxPublisher } from './outbox-publisher';

@Global()
@Module({
  providers: [EventRecorder, BullMqEventBus, OutboxPublisher],
  exports: [EventRecorder, BullMqEventBus, OutboxPublisher],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class EventsModule {}
