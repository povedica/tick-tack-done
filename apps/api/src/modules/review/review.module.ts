import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';

@Module({ controllers: [ReviewController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class ReviewModule {}
