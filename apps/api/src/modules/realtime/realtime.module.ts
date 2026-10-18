import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';

@Module({ controllers: [RealtimeController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class RealtimeModule {}
