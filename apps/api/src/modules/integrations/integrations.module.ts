import { Module } from '@nestjs/common';
import { ListsModule } from '../lists/lists.module';
import { TasksModule } from '../tasks/tasks.module';
import { IntegrationsController } from './integrations.controller';
import { TelegramApi } from './telegram-api';
import { TelegramBotService } from './telegram-bot.service';

// The bot is an inbound adapter. Task writes go through TasksService so NLP and events stay one path.
// List creation uses ListsService the same way. TasksModule does not import ListsModule.
@Module({
  imports: [TasksModule, ListsModule],
  controllers: [IntegrationsController],
  providers: [TelegramBotService, TelegramApi],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class IntegrationsModule {}
