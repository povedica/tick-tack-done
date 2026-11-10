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

export class SyncSubscriptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({ nullable: true, type: String })
  provider!: string | null;

  @ApiProperty({ enum: ['ok', 'error', 'reconnect_required'] })
  health!: 'ok' | 'error' | 'reconnect_required';

  @ApiProperty({ nullable: true, type: String })
  last_synced_at!: string | null;

  @ApiProperty({ nullable: true, type: String })
  last_reconciled_at!: string | null;

  @ApiProperty({ nullable: true, type: String })
  last_error!: string | null;

  @ApiProperty()
  event_count!: number;
}

export class SyncGoogleDto {
  @ApiProperty()
  status!: string;

  @ApiProperty()
  connected!: boolean;

  @ApiProperty({ nullable: true, type: String })
  account!: string | null;
}

export class SyncStatusDto {
  @ApiProperty({ type: SyncGoogleDto })
  google!: SyncGoogleDto;

  @ApiProperty({ type: [SyncSubscriptionDto] })
  subscriptions!: SyncSubscriptionDto[];
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
