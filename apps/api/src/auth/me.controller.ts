import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { MeResponseDto, UpdateMeDto } from './me.dto';
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
}
