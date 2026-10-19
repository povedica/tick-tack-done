import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { SyncService } from './sync.service.js';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Get()
  @Scopes('tasks:read')
  @ApiOperation({
    summary:
      'Delta sync since an event id. Tombstones older than 90 days are omitted (RF-13011, RF-13014).',
  })
  delta(
    @CurrentUser() user: AuthUser,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.sync.delta(user, since, limit);
  }
}
