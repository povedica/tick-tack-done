import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { ExportService } from './export.service';

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(@Inject(ExportService) private readonly exports: ExportService) {}

  @Get('json')
  @Scopes('backup:read')
  @ApiOperation({ summary: 'Versioned JSON export of the user state (RF-1703, RF-1705)' })
  @ApiOkResponse({ description: 'schema_version plus the user state' })
  json(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.exports.json(user);
  }
}
