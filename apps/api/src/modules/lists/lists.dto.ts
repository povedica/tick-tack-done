import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_REMINDER_TRIGGERS, LIST_REMINDER_OFF } from '@reflexionia/domain';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class CreateFolderDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateFolderDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  folder_id?: string | null;

  @ApiProperty({ required: false, enum: ['list', 'kanban', 'timeline'] })
  @IsOptional()
  @IsIn(['list', 'kanban', 'timeline'])
  view_mode?: 'list' | 'kanban' | 'timeline';

  @ApiProperty({ required: false, enum: ['TASK', 'NOTE'] })
  @IsOptional()
  @IsIn(['TASK', 'NOTE'])
  kind?: 'TASK' | 'NOTE';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateProjectDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  folder_id?: string | null;

  @ApiProperty({ required: false, enum: ['list', 'kanban', 'timeline'] })
  @IsOptional()
  @IsIn(['list', 'kanban', 'timeline'])
  view_mode?: 'list' | 'kanban' | 'timeline';

  @ApiProperty({ required: false, enum: ['TASK', 'NOTE'] })
  @IsOptional()
  @IsIn(['TASK', 'NOTE'])
  kind?: 'TASK' | 'NOTE';

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
    nullable: true,
    description: "Null inherits the account reminder. 'off' stays quiet.",
  })
  @IsOptional()
  @IsIn([...ACCOUNT_REMINDER_TRIGGERS, LIST_REMINDER_OFF])
  default_reminder_trigger?: string | null;
}

export class CreateColumnDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  collapsed?: boolean;

  @ApiProperty({ required: false, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  wip_limit?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateColumnDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  collapsed?: boolean;

  @ApiProperty({ required: false, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  wip_limit?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class FolderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class ProjectResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ nullable: true, type: String })
  folder_id!: string | null;

  @ApiProperty({ enum: ['list', 'kanban', 'timeline'] })
  view_mode!: 'list' | 'kanban' | 'timeline';

  @ApiProperty({ enum: ['TASK', 'NOTE'] })
  kind!: 'TASK' | 'NOTE';

  @ApiProperty()
  closed!: boolean;

  @ApiProperty()
  is_inbox!: boolean;

  @ApiProperty({ nullable: true, type: String })
  default_reminder_trigger!: string | null;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  active_task_count!: number;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class ColumnResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  project_id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  collapsed!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  wip_limit!: number | null;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class FolderPageDto {
  @ApiProperty({ type: [FolderResponseDto] })
  items!: FolderResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class ProjectPageDto {
  @ApiProperty({ type: [ProjectResponseDto] })
  items!: ProjectResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class ColumnPageDto {
  @ApiProperty({ type: [ColumnResponseDto] })
  items!: ColumnResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}
