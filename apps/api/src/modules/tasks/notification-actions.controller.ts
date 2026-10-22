import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/scopes.decorator.js';
import { NotificationActionDto } from '../../notifications/notifications.dto.js';
import { TasksService } from './tasks.service.js';
@ApiTags('reminders')
@Controller('reminders')
export class NotificationActionsController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Post(':id/action')
  @Public()
  @ApiOperation({
    summary:
      'Complete, snooze ten minutes or open with a single-use notification capability. No session or Bearer token is accepted as a substitute.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { applied: { type: 'boolean' }, url: { type: 'string' } },
    },
  })
  action(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        expectedType: NotificationActionDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: NotificationActionDto,
  ) {
    return this.tasks.notificationAction(id, dto.token, dto.action);
  }
}
