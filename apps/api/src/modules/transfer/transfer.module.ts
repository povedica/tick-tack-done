import { Module } from '@nestjs/common';
import { TransferController } from './transfer.controller';

@Module({ controllers: [TransferController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class TransferModule {}
