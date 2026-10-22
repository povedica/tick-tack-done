import { ApiProperty } from '@nestjs/swagger';
import { API_VERSION, buildVersion } from '../build-info.js';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status = 'ok' as const;

  @ApiProperty({ type: String, example: 'unknown' })
  commit: string = /^[a-f0-9]{7,40}$/i.test(process.env.GIT_COMMIT ?? '')
    ? (process.env.GIT_COMMIT ?? 'unknown')
    : 'unknown';

  @ApiProperty({ type: String, example: '0.2.0' })
  version: string = API_VERSION;

  @ApiProperty({ type: String, example: '2026-10-22T10:00:00Z' })
  built_at: string = process.env.BUILD_TIME ?? 'unknown';

  @ApiProperty({
    type: String,
    example: '0.2.0+abcdef1',
    description: 'Same serverInfo.version returned by MCP initialize',
  })
  mcp_version: string = buildVersion();
}
