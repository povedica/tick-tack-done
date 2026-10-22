import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NOTIFICATION_KINDS, NOTIFICATION_CHANNELS } from '@reflexionia/domain';
export class PreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_KINDS })
  @IsIn(NOTIFICATION_KINDS)
  kind!: (typeof NOTIFICATION_KINDS)[number];
  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: (typeof NOTIFICATION_CHANNELS)[number];
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
export class QuietHoursDto {
  @ApiProperty({ nullable: true, type: String })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start!: string | null;
  @ApiProperty({ nullable: true, type: String })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end!: string | null;
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];
  @ApiProperty() @IsBoolean() allow_high!: boolean;
}
export class NotificationSettingsWriteDto {
  @ApiProperty({ type: [PreferenceDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceDto)
  preferences?: PreferenceDto[];
  @ApiProperty({ type: QuietHoursDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quiet_hours?: QuietHoursDto;
}
export class NotificationTestDto {
  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: (typeof NOTIFICATION_CHANNELS)[number];
}
export class NotificationActionDto {
  @ApiProperty({ enum: ['complete', 'snooze', 'open'] })
  @IsIn(['complete', 'snooze', 'open'])
  action!: 'complete' | 'snooze' | 'open';
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{24}$/) token!: string;
}
