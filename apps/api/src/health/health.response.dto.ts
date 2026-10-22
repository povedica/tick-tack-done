import { ApiProperty } from '@nestjs/swagger';
import { API_VERSION, buildVersion } from '../build-info.js';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status = 'ok' as const;

  @ApiProperty({ example: 'unknown' })
  commit = /^[a-f0-9]{7,40}$/i.test(process.env.GIT_COMMIT ?? '')
    ? process.env.GIT_COMMIT
    : 'unknown';

  @ApiProperty({ example: '0.1.0' })
  version = API_VERSION;

  @ApiProperty({ example: '2026-10-22T10:00:00Z' })
  built_at = process.env.BUILD_TIME ?? 'unknown';

  @ApiProperty({
    example: '0.1.0+abcdef1',
    description: 'Same serverInfo.version returned by MCP initialize',
  })
  mcp_version = buildVersion();
}
