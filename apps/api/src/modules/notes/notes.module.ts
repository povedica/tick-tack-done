import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';

@Module({ controllers: [NotesController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class NotesModule {}
