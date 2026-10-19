import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status = 'ok' as const;

  @ApiProperty({ example: 'unknown' })
  commit = process.env.GIT_COMMIT ?? 'unknown';
}
