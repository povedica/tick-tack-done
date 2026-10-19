import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiProperty({ required: false, enum: ['ical', 'google'] })
  @IsOptional()
  @IsIn(['ical', 'google'])
  provider?: 'ical' | 'google';

  @ApiProperty({ required: false, description: 'Real Google calendar id (RF-2502)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  calendar_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @ApiProperty({ required: false, enum: ['read', 'two_way'] })
  @IsOptional()
  @IsIn(['read', 'two_way'])
  sync_direction?: 'read' | 'two_way';
}

export class UpdateSubscriptionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  summary?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class FeedDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  filter_id?: string;
}
