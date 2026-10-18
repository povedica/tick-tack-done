import { Module } from '@nestjs/common';
import { AchievementsController, LocationController } from './account-extra.controller';

@Module({ controllers: [LocationController, AchievementsController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AccountExtraModule {}
