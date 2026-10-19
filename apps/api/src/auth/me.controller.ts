import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccountService } from './account.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthUser } from './auth-user.js';
import {
  ChangePasswordDto,
  DeleteMeDto,
  InboundEmailAddressDto,
  InboundEmailStatusDto,
  MeResponseDto,
  NotificationHealthDto,
  PushSubscriptionDto,
  UpdateMeDto,
} from './me.dto.js';
import { MeService } from './me.service.js';
import { ACCOUNT_ADMIN_SCOPE } from './scopes.js';
import { Scopes } from './scopes.decorator.js';

@ApiTags('me')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('me')
export class MeController {
  constructor(
    @Inject(MeService) private readonly me: MeService,
    @Inject(AccountService) private readonly account: AccountService,
  ) {}

  @Delete()
  @Scopes(ACCOUNT_ADMIN_SCOPE)
  @ApiOperation({
    summary: 'Delete the account and its data after email confirmation (section 15)',
  })
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteMeDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.account.delete(user, dto);
    res.status(204).end();
  }

  @Get()
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.me.get(user);
  }

  @Post('password')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Change the password and sign out other sessions' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.account.changePassword(user, dto);
    res.status(204).end();
  }

  @Patch()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Update profile settings, including RF-206 completion policy' })
  @ApiOkResponse({ type: MeResponseDto })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<MeResponseDto> {
    return this.me.update(user, dto);
  }

  @Get('inbound-email')
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Whether the email-to-task address is active (RF-105). The token is not returned.',
  })
  @ApiOkResponse({ type: InboundEmailStatusDto })
  inboundEmail(@CurrentUser() user: AuthUser): Promise<InboundEmailStatusDto> {
    return this.me.inboundEmailStatus(user);
  }

  @Get('notifications/health')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Last 20 reminder deliveries, with channel and result (NT-09)' })
  @ApiOkResponse({ type: NotificationHealthDto })
  notificationHealth(@CurrentUser() user: AuthUser): Promise<NotificationHealthDto> {
    return this.me.notificationHealth(user);
  }

  @Post('inbound-email')
  @Scopes('profile:write')
  @ApiOperation({
    summary: 'Create or regenerate the email-to-task address (RF-105). The token is shown once.',
  })
  @ApiOkResponse({ type: InboundEmailAddressDto })
  rotateInboundEmail(@CurrentUser() user: AuthUser): Promise<InboundEmailAddressDto> {
    return this.me.rotateInboundEmail(user);
  }

  @Delete('inbound-email')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Revoke the email-to-task address immediately (RF-105)' })
  async revokeInboundEmail(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    await this.me.revokeInboundEmail(user);
    res.status(204).end();
  }

  @Post('push-subscriptions')
  @Scopes('reminders:write')
  @ApiOperation({ summary: 'Register a Web Push subscription (RF-802)' })
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscriptionDto,
  ): Promise<{ id: string }> {
    return this.me.subscribe(user, dto);
  }

  @Delete('push-subscriptions/:id')
  @Scopes('reminders:write')
  @ApiOperation({ summary: 'Remove a Web Push subscription' })
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.me.unsubscribe(user, id);
    res.status(204).end();
  }
}
