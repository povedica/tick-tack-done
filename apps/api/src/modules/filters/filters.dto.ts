import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const MODES = ['normal', 'advanced'] as const;
const COMBINATORS = ['AND', 'OR'] as const;

export class FilterConditionDto {
  @ApiProperty({
    enum: ['list', 'tag', 'date', 'priority', 'keyword', 'status', 'assignee'],
  })
  @IsString()
  field!: string;

  @ApiProperty()
  @IsString()
  op!: string;

  @ApiProperty({
    required: false,
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  @IsOptional()
  @Allow()
  value?: string | string[];
}

export class FilterGroupDto {
  @ApiProperty({ enum: COMBINATORS })
  @IsIn(COMBINATORS)
  combinator!: 'AND' | 'OR';

  @ApiProperty({ type: [FilterConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  conditions!: FilterConditionDto[];
}

export class FilterRulesDto {
  @ApiProperty({ enum: COMBINATORS })
  @IsIn(COMBINATORS)
  combinator!: 'AND' | 'OR';

  @ApiProperty({ type: [FilterGroupDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterGroupDto)
  groups!: FilterGroupDto[];
}

export class CreateFilterDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
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

  @ApiProperty({ enum: MODES })
  @IsIn(MODES)
  mode!: 'normal' | 'advanced';

  @ApiProperty({ type: FilterRulesDto })
  @ValidateNested()
  @Type(() => FilterRulesDto)
  rules!: FilterRulesDto;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;
}

export class UpdateFilterDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
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

  @ApiProperty({ required: false, enum: MODES })
  @IsOptional()
  @IsIn(MODES)
  mode?: 'normal' | 'advanced';

  @ApiProperty({ required: false, type: FilterRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FilterRulesDto)
  rules?: FilterRulesDto;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;

  @ApiProperty({ required: false, description: 'Place the filter first in the sidebar (RF-903).' })
  @IsOptional()
  @IsBoolean()
  pin?: boolean;
}

export class PreviewFilterDto {
  @ApiProperty({ enum: MODES })
  @IsIn(MODES)
  mode!: 'normal' | 'advanced';

  @ApiProperty({ type: FilterRulesDto })
  @ValidateNested()
  @Type(() => FilterRulesDto)
  rules!: FilterRulesDto;
}

export class ViewChecklistDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['active', 'completed'] })
  status!: 'active' | 'completed';
}

export class ViewTagDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ViewTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: ['task', 'note'] })
  kind!: 'task' | 'note';

  @ApiProperty({ enum: ['active', 'completed', 'archived', 'cancelled'] })
  status!: 'active' | 'completed' | 'archived' | 'cancelled';

  @ApiProperty({ enum: ['none', 'low', 'medium', 'high'] })
  priority!: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({ nullable: true, type: String })
  due_date!: string | null;

  @ApiProperty()
  is_all_day!: boolean;

  @ApiProperty()
  time_zone!: string;

  @ApiProperty()
  project_id!: string;

  @ApiProperty()
  project_name!: string;

  @ApiProperty({ nullable: true, type: String })
  column_id!: string | null;

  @ApiProperty({ nullable: true, type: String })
  column_name!: string | null;

  @ApiProperty({ type: [ViewTagDto] })
  tags!: ViewTagDto[];

  @ApiProperty({ type: [ViewChecklistDto] })
  checklist!: ViewChecklistDto[];

  @ApiProperty()
  checklist_progress!: { completed: number; total: number };

  @ApiProperty()
  sort_order!: string;

  @ApiProperty({ nullable: true, type: String })
  assignee_id!: string | null;

  @ApiProperty()
  created_at!: string;

  @ApiProperty({ nullable: true, type: String })
  completed_at!: string | null;

  @ApiProperty({ nullable: true, type: String })
  repeat_rule!: string | null;

  @ApiProperty({ enum: ['manual', 'import', 'api', 'automation', 'plugin'] })
  source!: 'manual' | 'import' | 'api' | 'automation' | 'plugin';

  @ApiProperty({ nullable: true, type: String })
  deleted_at!: string | null;
}

export class ViewGroupDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ type: [ViewTaskDto] })
  tasks!: ViewTaskDto[];
}

export class ViewPageDto {
  @ApiProperty()
  count!: number;

  @ApiProperty({ enum: ['none', 'section', 'date', 'tag', 'priority'] })
  group_by!: string;

  @ApiProperty({ enum: ['manual', 'date', 'priority', 'title', 'created'] })
  sort!: string;

  @ApiProperty({ type: [ViewGroupDto] })
  groups!: ViewGroupDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class FilterResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  icon!: string | null;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ enum: MODES })
  mode!: 'normal' | 'advanced';

  @ApiProperty({ type: FilterRulesDto })
  rules!: FilterRulesDto;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  task_count!: number;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class FilterPageDto {
  @ApiProperty({ type: [FilterResponseDto] })
  items!: FilterResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class SmartListItemDto {
  @ApiProperty({
    enum: [
      'today',
      'tomorrow',
      'next_7_days',
      'all',
      'inbox',
      'assigned_to_me',
      'completed',
      'trash',
      'no_date',
      'recently_added',
    ],
  })
  @IsIn([
    'today',
    'tomorrow',
    'next_7_days',
    'all',
    'inbox',
    'assigned_to_me',
    'completed',
    'trash',
    'no_date',
    'recently_added',
  ])
  key!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateSmartListsDto {
  @ApiProperty({ type: [SmartListItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SmartListItemDto)
  items!: SmartListItemDto[];
}

export class SmartListResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  task_count!: number;
}

export class SmartListPageDto {
  @ApiProperty({ type: [SmartListResponseDto] })
  items!: SmartListResponseDto[];
}
