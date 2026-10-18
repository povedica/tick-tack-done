import { Module } from '@nestjs/common';
import { FocusController } from './focus.controller';

@Module({ controllers: [FocusController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class FocusModule {}
