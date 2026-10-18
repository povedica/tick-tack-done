import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { IntegrationsController } from './integrations.controller';
import { TelegramApi } from './telegram-api';
import { TelegramBotService } from './telegram-bot.service';

// The bot is an inbound adapter. Task writes go through TasksService so NLP and events stay one path.
@Module({
  imports: [TasksModule],
  controllers: [IntegrationsController],
  providers: [TelegramBotService, TelegramApi],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class IntegrationsModule {}
