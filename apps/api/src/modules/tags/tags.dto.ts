import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class CreateTagDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class UpdateTagDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Matches(HEX)
  color?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  before_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  move_to_end?: boolean;
}

export class MergeTagsDto {
  @ApiProperty()
  @IsUUID()
  source_id!: string;

  @ApiProperty()
  @IsUUID()
  target_id!: string;
}

export class TagResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ nullable: true, type: String })
  parent_id!: string | null;

  @ApiProperty()
  sort_order!: string;

  @ApiProperty()
  active_task_count!: number;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class TagPageDto {
  @ApiProperty({ type: [TagResponseDto] })
  items!: TagResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}
