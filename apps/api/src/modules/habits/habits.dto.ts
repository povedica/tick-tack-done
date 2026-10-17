import { ApiProperty } from '@nestjs/swagger';
import { HABIT_WEEKDAYS } from '@reflexionia/domain';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const CLOCK = /^(\d{2}):(\d{2})$/;

export class HabitGoalDto {
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  times_per_period!: number;

  @ApiProperty({ enum: ['day', 'week'] })
  @IsIn(['day', 'week'])
  period!: 'day' | 'week';

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  target_count!: number;
}

export class CreateHabitDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ type: HabitGoalDto })
  @ValidateNested()
  @Type(() => HabitGoalDto)
  goal!: HabitGoalDto;

  @ApiProperty({ enum: HABIT_WEEKDAYS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(HABIT_WEEKDAYS, { each: true })
  frequency!: string[];

  @ApiProperty({ required: false, nullable: true, type: String, example: '09:00' })
  @IsOptional()
  @Matches(CLOCK)
  reminder_time?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivation_note?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateHabitDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ required: false, type: HabitGoalDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HabitGoalDto)
  goal?: HabitGoalDto;

  @ApiProperty({ required: false, enum: HABIT_WEEKDAYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(HABIT_WEEKDAYS, { each: true })
  frequency?: string[];

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Matches(CLOCK)
  reminder_time?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivation_note?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class CheckInDto {
  @ApiProperty({ example: '2026-10-17' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  count!: number;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class HabitTodayDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty()
  met!: boolean;
}

export class HabitResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  icon!: string | null;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ type: HabitGoalDto })
  goal!: HabitGoalDto;

  @ApiProperty({ enum: HABIT_WEEKDAYS, isArray: true })
  frequency!: string[];

  @ApiProperty({ nullable: true, type: String })
  reminder_time!: string | null;

  @ApiProperty({ nullable: true, type: String })
  motivation_note!: string | null;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty({ type: HabitTodayDto })
  today!: HabitTodayDto;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class HabitPageDto {
  @ApiProperty({ type: [HabitResponseDto] })
  items!: HabitResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class CheckInResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  habit_id!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty()
  goal_met!: boolean;

  @ApiProperty()
  streak_broken!: boolean;
}

export class HabitHeatCellDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  met!: boolean;

  @ApiProperty()
  scheduled!: boolean;
}

export class AggregateHeatCellDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  scheduled!: number;

  @ApiProperty()
  met!: number;
}

export class HabitCompletionDto {
  @ApiProperty()
  week!: number;

  @ApiProperty()
  month!: number;
}

export class HabitStatsDto {
  @ApiProperty()
  streak_current!: number;

  @ApiProperty()
  streak_best!: number;

  @ApiProperty({ type: HabitCompletionDto })
  completion_percent!: HabitCompletionDto;

  @ApiProperty({ type: [HabitHeatCellDto] })
  heatmap!: HabitHeatCellDto[];

  @ApiProperty({ type: [AggregateHeatCellDto] })
  aggregate_heatmap!: AggregateHeatCellDto[];
}
