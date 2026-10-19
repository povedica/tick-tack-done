import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { BackupsService } from './backups.service.js';

export class RestoreBackupDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  @MaxLength(20)
  stamp!: string;

  @ApiProperty({ example: 'restore' })
  @IsString()
  confirmation!: string;
}

@ApiTags('backups')
@Controller('backups')
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backups: BackupsService) {}

  @Get()
  @Scopes('backup:read')
  @ApiOperation({ summary: 'List backup stamps on this machine (RF-1704)' })
  list(@CurrentUser() _user: AuthUser): Promise<unknown> {
    return this.backups.list();
  }

  @Post('restore')
  @HttpCode(200)
  @Scopes('backup:read')
  @ApiOperation({
    summary: 'Verify a backup archive. Applying it stays on the host script (RF-1704).',
  })
  restore(@CurrentUser() _user: AuthUser, @Body() dto: RestoreBackupDto): Promise<unknown> {
    return this.backups.restore(dto.stamp, dto.confirmation);
  }
}
