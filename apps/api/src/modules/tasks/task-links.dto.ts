import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class AddTaskLinkDto {
  @ApiProperty({ maxLength: 4096 }) @IsString() @MinLength(1) @MaxLength(4096) url!: string;
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
export class TaskLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() task_id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ enum: ['auto', 'manual'] }) source!: string;
  @ApiProperty() created_at!: string;
  @ApiProperty() updated_at!: string;
}
export class TaskLinkPageDto {
  @ApiProperty({ type: [TaskLinkResponseDto] }) items!: TaskLinkResponseDto[];
  @ApiProperty({ type: String, nullable: true }) next_cursor!: null;
}
