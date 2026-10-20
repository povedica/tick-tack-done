import { Module } from '@nestjs/common';
import { StatsModule } from '../stats/stats.module.js';
import { AchievementsController, LocationController } from './account-extra.controller.js';

@Module({
  imports: [StatsModule],
  controllers: [LocationController, AchievementsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AccountExtraModule {}
