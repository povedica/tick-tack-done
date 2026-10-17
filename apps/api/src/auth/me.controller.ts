import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { MeResponseDto, PushSubscriptionDto, UpdateMeDto } from './me.dto';
import { MeService } from './me.service';
import { Scopes } from './scopes.decorator';

@ApiTags('me')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('me')
export class MeController {
  constructor(@Inject(MeService) private readonly me: MeService) {}

  @Get()
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.me.get(user);
  }

  @Patch()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Update profile settings, including RF-206 completion policy' })
  @ApiOkResponse({ type: MeResponseDto })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<MeResponseDto> {
    return this.me.update(user, dto);
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
