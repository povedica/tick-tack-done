import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
const KINDS = ['task', 'note'] as const;

export class CreateTaskDto {
  @ApiProperty({
    required: false,
    description:
      'Required unless raw_text is set. An explicit list overrides a parsed ^list or ~list.',
  })
  @ValidateIf((dto: CreateTaskDto) => dto.project_id !== undefined || dto.raw_text === undefined)
  @IsUUID()
  project_id?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  column_id?: string | null;

  @ApiProperty({
    required: false,
    maxLength: 500,
    description:
      'Required unless raw_text yields a title. Stored as sent, including edge spaces. Empty is valid. An explicit title overrides the parse.',
  })
  @ValidateIf((dto: CreateTaskDto) => dto.raw_text === undefined || dto.title !== undefined)
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiProperty({
    required: false,
    maxLength: 2000,
    description:
      'Quick add text. The server parses it (RF-102). A missing ^list or #tag is created. Explicit fields in this body override the parse and do not create the parsed list or tags.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  raw_text?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @ApiProperty({ required: false, enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: 'task' | 'note';

  @ApiProperty({ required: false, enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  start_date?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  due_date?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  time_zone?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  duration_minutes?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  repeat_rule?: string | null;

  @ApiProperty({ required: false, enum: ['due_date', 'completion_date'] })
  @IsOptional()
  @IsIn(['due_date', 'completion_date'])
  repeat_from?: 'due_date' | 'completion_date';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  tag_ids?: string[];

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  extract_checklist?: boolean;

  @ApiProperty({ required: false, enum: ['checklist', 'subtask'] })
  @IsOptional()
  @IsIn(['checklist', 'subtask'])
  extract_as?: 'checklist' | 'subtask';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  column_id?: string | null;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @ApiProperty({ required: false, enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: 'task' | 'note';

  @ApiProperty({ required: false, enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  start_date?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  due_date?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  time_zone?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  duration_minutes?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  repeat_rule?: string | null;

  @ApiProperty({ required: false, enum: ['due_date', 'completion_date'] })
  @IsOptional()
  @IsIn(['due_date', 'completion_date'])
  repeat_from?: 'due_date' | 'completion_date';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  tag_ids?: string[];

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  extract_checklist?: boolean;

  @ApiProperty({ required: false, enum: ['checklist', 'subtask'] })
  @IsOptional()
  @IsIn(['checklist', 'subtask'])
  extract_as?: 'checklist' | 'subtask';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;

  @ApiProperty({
    required: false,
    type: Object,
    description: 'Per-field client clocks for last-write-wins (RF-13012). ISO-8601 values.',
  })
  @IsOptional()
  @IsObject()
  field_clocks?: Record<string, string>;
}

export class CompleteTaskDto {
  @ApiProperty({ required: false, enum: ['complete', 'leave'] })
  @IsOptional()
  @IsIn(['complete', 'leave'])
  complete_children?: 'complete' | 'leave';
}

export class MoveTaskDto {
  @ApiProperty()
  @IsUUID()
  project_id!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  column_id?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_task_id?: string | null;
}

export class BatchTasksDto {
  @ApiProperty({ enum: ['complete', 'move', 'tag', 'priority', 'due', 'delete'] })
  @IsIn(['complete', 'move', 'tag', 'priority', 'due', 'delete'])
  action!: 'complete' | 'move' | 'tag' | 'priority' | 'due' | 'delete';

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  column_id?: string | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tag_ids?: string[];

  @ApiProperty({ required: false, enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  due_date?: string | null;

  @ApiProperty({ required: false, enum: ['complete', 'leave'] })
  @IsOptional()
  @IsIn(['complete', 'leave'])
  complete_children?: 'complete' | 'leave';
}

export class ChecklistItemDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  start_date?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  due_date?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  time_zone?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateChecklistItemDto {
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  start_date?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  due_date?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  time_zone?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class ChecklistProgressDto {
  @ApiProperty()
  completed!: number;

  @ApiProperty()
  total!: number;
}

export class SnoozeTaskDto {
  @ApiProperty({ enum: ['tomorrow', 'next_week', 'date'] })
  @IsIn(['tomorrow', 'next_week', 'date'])
  preset!: 'tomorrow' | 'next_week' | 'date';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  date?: string | null;
}

export class DetachOccurrenceDto {
  @ApiProperty()
  @IsString()
  due_date!: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;
}

export class CreateReminderDto {
  @ApiProperty({ example: 'TRIGGER:-PT5M' })
  @IsString()
  @MaxLength(200)
  trigger!: string;

  @ApiProperty({ enum: ['relative', 'absolute', 'location', 'daily_digest'] })
  @IsIn(['relative', 'absolute', 'location', 'daily_digest'])
  type!: 'relative' | 'absolute' | 'location' | 'daily_digest';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  absolute_at?: string | null;

  @ApiProperty({ required: false, enum: ['push', 'email', 'both'] })
  @IsOptional()
  @IsIn(['push', 'email', 'both'])
  channel?: 'push' | 'email' | 'both';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  constant?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  constant_interval_minutes?: number | null;

  @ApiProperty({ required: false, nullable: true, type: Object })
  @IsOptional()
  @IsObject()
  location?: Record<string, unknown> | null;
}

export class SnoozeReminderDto {
  @ApiProperty({ enum: ['10m', '1h', 'tomorrow', 'custom'] })
  @IsIn(['10m', '1h', 'tomorrow', 'custom'])
  preset!: '10m' | '1h' | 'tomorrow' | 'custom';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  until?: string | null;
}

export class TaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  project_id!: string;

  @ApiProperty({ nullable: true, type: String })
  parent_id!: string | null;

  @ApiProperty({ nullable: true, type: String })
  column_id!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: KINDS })
  kind!: 'task' | 'note';

  @ApiProperty({ enum: ['active', 'completed', 'archived'] })
  status!: 'active' | 'completed' | 'archived';

  @ApiProperty({ enum: PRIORITIES })
  priority!: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty()
  is_all_day!: boolean;

  @ApiProperty({ nullable: true, type: String })
  start_date!: string | null;

  @ApiProperty({ nullable: true, type: String })
  due_date!: string | null;

  @ApiProperty()
  time_zone!: string;

  @ApiProperty({ nullable: true, type: Number })
  duration_minutes!: number | null;

  @ApiProperty({ nullable: true, type: String })
  repeat_rule!: string | null;

  @ApiProperty({ enum: ['due_date', 'completion_date'] })
  repeat_from!: 'due_date' | 'completion_date';

  @ApiProperty({ nullable: true, type: String })
  series_id!: string | null;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty({ type: [String] })
  tag_ids!: string[];

  @ApiProperty({ nullable: true, type: String })
  assignee_id!: string | null;

  @ApiProperty()
  created_by!: string;

  @ApiProperty({ nullable: true, type: String })
  completed_at!: string | null;

  @ApiProperty()
  source!: string;

  @ApiProperty({ type: ChecklistProgressDto })
  checklist_progress!: ChecklistProgressDto;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;

  @ApiProperty({ nullable: true, type: String })
  deleted_at!: string | null;
}

export class TaskPageDto {
  @ApiProperty({ type: [TaskResponseDto] })
  items!: TaskResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class CaptureWarningDto {
  @ApiProperty({
    enum: [
      'list_not_found',
      'list_created',
      'tag_not_found',
      'tag_created',
      'reminder_without_date',
    ],
  })
  code!:
    | 'list_not_found'
    | 'list_created'
    | 'tag_not_found'
    | 'tag_created'
    | 'reminder_without_date';

  @ApiProperty({ required: false })
  name?: string;
}

export class CreateTaskResponseDto extends TaskResponseDto {
  @ApiProperty({ required: false, type: [CaptureWarningDto] })
  warnings?: CaptureWarningDto[];
}
