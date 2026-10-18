import { Module } from '@nestjs/common';
import { MatrixController } from './matrix.controller';

@Module({ controllers: [MatrixController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class MatrixModule {}
