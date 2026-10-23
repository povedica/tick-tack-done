import { Body, Controller, Get, Inject, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth-user.js';
import { Scopes } from '../auth/scopes.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationSettingsWriteDto, NotificationTestDto } from './notifications.dto.js';
@ApiTags('notifications')
@Controller('me/notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  @Get('settings')
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Owned 8×3 notification matrix, channel availability and civil quiet hours',
  })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  settings(@CurrentUser() user: AuthUser) {
    return this.notifications.settings(user);
  }
  @Put('settings')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Update notification preferences and quiet hours; no MCP write tool' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  update(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: NotificationSettingsWriteDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: NotificationSettingsWriteDto,
  ) {
    return this.notifications.update(user, dto);
  }
  @Post('test')
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Send a real test only to the authenticated owner; reports precise channel errors',
  })
  @ApiOkResponse({ schema: { type: 'object', properties: { sent: { type: 'boolean' } } } })
  test(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: NotificationTestDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: NotificationTestDto,
  ) {
    return this.notifications.test(user, dto.channel);
  }
  @Get('deliveries')
  @Scopes('profile:read')
  @ApiOperation({
    summary:
      'Last 50 owned channel outcomes, cursor paginated; quiet deferrals retain their reason',
  })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  deliveries(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.notifications.deliveries(user, cursor);
  }
}
