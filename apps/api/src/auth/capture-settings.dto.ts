import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_REMINDER_TRIGGERS, type CaptureSettings } from '@reflexionia/domain';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class CaptureSettingsDto implements CaptureSettings {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  recognize_dates!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  remove_date_text!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  recognize_tags!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  remove_tag_text!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  parse_url_title!: boolean;

  @ApiProperty({ enum: ['none', 'today', 'tomorrow'] })
  @IsIn(['none', 'today', 'tomorrow'])
  default_date!: 'none' | 'today' | 'tomorrow';

  @ApiProperty({ enum: ['date', 'date_time'] })
  @IsIn(['date', 'date_time'])
  default_date_mode!: 'date' | 'date_time';

  @ApiProperty({ type: String, example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  default_time!: string;

  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  default_duration_minutes!: number | null;

  @ApiProperty({ enum: ['none', 'low', 'medium', 'high'] })
  @IsIn(['none', 'low', 'medium', 'high'])
  default_priority!: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  default_tag_id!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  default_list_id!: string | null;

  @ApiProperty({ enum: ['inherit', 'none', ...ACCOUNT_REMINDER_TRIGGERS] })
  @IsIn(['inherit', 'none', ...ACCOUNT_REMINDER_TRIGGERS])
  timed_reminder!: CaptureSettings['timed_reminder'];

  @ApiProperty({ enum: ['inherit', 'none', ...ACCOUNT_REMINDER_TRIGGERS] })
  @IsIn(['inherit', 'none', ...ACCOUNT_REMINDER_TRIGGERS])
  all_day_reminder!: CaptureSettings['timed_reminder'];

  @ApiProperty({ enum: ['top', 'bottom'] })
  @IsIn(['top', 'bottom'])
  new_task_position!: 'top' | 'bottom';

  @ApiProperty({ enum: ['top', 'bottom'] })
  @IsIn(['top', 'bottom'])
  overdue_position!: 'top' | 'bottom';
}
