import { Global, Module } from '@nestjs/common';
import { EventRecorder } from './event-recorder';

@Global()
@Module({
  providers: [EventRecorder],
  exports: [EventRecorder],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class EventsModule {}
