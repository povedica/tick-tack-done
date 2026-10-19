import { ApiProperty, PartialType } from '@nestjs/swagger';
import { COUNTDOWN_COLORS, COUNTDOWN_DAY_MODES, COUNTDOWN_REPEATS, COUNTDOWN_TYPES } from '@reflexionia/domain';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CountdownReminderDto {
  @ApiProperty({ minimum: 0, maximum: 365 })
  @IsInt() @Min(0) @Max(365)
  offset_days!: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  constant?: boolean;
}

export class CreateCountdownDto {
  @ApiProperty({ minLength: 1, maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200)
  title!: string;
  @ApiProperty({ example: '2027-01-01' }) @Matches(DATE)
  target_date!: string;
  @ApiProperty({ enum: COUNTDOWN_TYPES, required: false }) @IsOptional() @IsIn(COUNTDOWN_TYPES)
  type?: (typeof COUNTDOWN_TYPES)[number];
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() @MaxLength(16)
  emoji?: string | null;
  @ApiProperty({ enum: COUNTDOWN_COLORS, required: false, nullable: true }) @IsOptional() @IsIn(COUNTDOWN_COLORS)
  color?: (typeof COUNTDOWN_COLORS)[number] | null;
  @ApiProperty({ enum: COUNTDOWN_REPEATS, required: false }) @IsOptional() @IsIn(COUNTDOWN_REPEATS)
  repeat_rule?: (typeof COUNTDOWN_REPEATS)[number];
  @ApiProperty({ enum: COUNTDOWN_DAY_MODES, required: false }) @IsOptional() @IsIn(COUNTDOWN_DAY_MODES)
  day_mode?: (typeof COUNTDOWN_DAY_MODES)[number];
  @ApiProperty({ required: false, type: [CountdownReminderDto] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => CountdownReminderDto)
  reminders?: CountdownReminderDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(10000)
  notes?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean()
  show_in_sidebar?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean()
  show_in_smart_list?: boolean;
}

export class UpdateCountdownDto extends PartialType(CreateCountdownDto) {
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean()
  pinned?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt()
  sort_order?: number;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() @MaxLength(1000)
  style?: string | null;
}

export class CountdownResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() target_date!: string;
  @ApiProperty({ enum: COUNTDOWN_TYPES }) type!: string;
  @ApiProperty({ nullable: true }) emoji!: string | null;
  @ApiProperty({ enum: COUNTDOWN_REPEATS }) repeat_rule!: string;
  @ApiProperty({ enum: COUNTDOWN_DAY_MODES }) day_mode!: string;
  @ApiProperty() kind!: 'until' | 'since' | 'today';
  @ApiProperty() days!: number;
  @ApiProperty() effective_date!: string;
  @ApiProperty() pinned!: boolean;
  @ApiProperty() sort_order!: string;
  @ApiProperty({ type: [CountdownReminderDto] }) reminders!: CountdownReminderDto[];
  @ApiProperty() show_in_sidebar!: boolean;
  @ApiProperty() show_in_smart_list!: boolean;
  @ApiProperty({ nullable: true }) color!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) archived_at!: string | null;
}

export class CountdownPageDto {
  @ApiProperty({ type: [CountdownResponseDto] }) items!: CountdownResponseDto[];
  @ApiProperty({ nullable: true }) next_cursor!: string | null;
}
