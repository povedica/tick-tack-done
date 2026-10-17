import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DevAuthGuard } from './dev-auth.guard';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  controllers: [MeController],
  providers: [MeService, { provide: APP_GUARD, useClass: DevAuthGuard }],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AuthModule {}
