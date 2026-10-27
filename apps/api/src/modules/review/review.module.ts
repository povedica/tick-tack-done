import { Module } from '@nestjs/common';
import { ListsModule } from '../lists/lists.module.js';
import { ReviewController } from './review.controller.js';

@Module({ imports: [ListsModule], controllers: [ReviewController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ReviewModule {}
