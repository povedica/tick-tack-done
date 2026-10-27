import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ProjectNextActionDto {
  @ApiProperty()
  task_id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  due_date!: string | null;

  @ApiProperty({ nullable: true, type: String })
  start_date!: string | null;

  @ApiProperty()
  is_all_day!: boolean;
}

export class ProjectOverviewItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ nullable: true, type: String })
  folder_id!: string | null;

  @ApiProperty({ nullable: true, type: String })
  outcome!: string | null;

  @ApiProperty({ enum: ['active', 'paused', 'archived'] })
  state!: 'active' | 'paused' | 'archived';

  @ApiProperty({ nullable: true, type: String })
  project_status_changed_at!: string | null;

  @ApiProperty({ nullable: true, type: String })
  closed_at!: string | null;

  @ApiProperty()
  created_at!: string;

  @ApiProperty({ nullable: true, type: String })
  project_reviewed_at!: string | null;

  @ApiProperty()
  done_count!: number;

  @ApiProperty()
  total_count!: number;

  @ApiProperty()
  open_count!: number;

  @ApiProperty({ nullable: true, type: ProjectNextActionDto })
  next_action!: ProjectNextActionDto | null;

  @ApiProperty({ nullable: true, type: String })
  last_activity_at!: string | null;

  @ApiProperty({ nullable: true, enum: ['no_next_action', 'stale'] })
  attention!: 'no_next_action' | 'stale' | null;
}

export class ProjectOverviewCountsDto {
  @ApiProperty()
  active!: number;

  @ApiProperty()
  paused!: number;

  @ApiProperty()
  archived!: number;
}

export class ProjectOverviewDto {
  @ApiProperty({ type: [ProjectOverviewItemDto] })
  items!: ProjectOverviewItemDto[];

  @ApiProperty({ type: ProjectOverviewCountsDto })
  counts!: ProjectOverviewCountsDto;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The board is not paged. Present so MCP list tools do not slice it.',
  })
  next_cursor!: null;
}

export class ReviewProjectsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class ProjectReviewResultDto {
  @ApiProperty()
  reviewed!: number;
}

export class InFlightProjectsDto {
  @ApiProperty({ type: [ProjectOverviewItemDto] })
  items!: ProjectOverviewItemDto[];

  @ApiProperty({ type: ProjectOverviewCountsDto })
  counts!: ProjectOverviewCountsDto;

  @ApiProperty()
  no_next_action_count!: number;
}

export class ReviewProjectGroupsDto {
  @ApiProperty({ type: [ProjectOverviewItemDto] })
  attention!: ProjectOverviewItemDto[];

  @ApiProperty({ type: [ProjectOverviewItemDto] })
  paused!: ProjectOverviewItemDto[];

  @ApiProperty({ type: [ProjectOverviewItemDto] })
  ok!: ProjectOverviewItemDto[];
}
