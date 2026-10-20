import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTickyAuthorityDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  list_ids?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  autonomy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  revoked?: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsUUID('4')
  inbox_list_id?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  action_scopes?: string[];

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  workday_start?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  workday_end?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  estimate_learning_enabled?: boolean;
}

export class PostTickyMessageDto {
  @ApiPropertyOptional({ pattern: '^[a-z][a-z0-9-]{0,63}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,63}$/)
  model_id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  client_message_id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;
}

export class StoreProposalDto {
  @ApiProperty({ description: 'Immutable proposal JSON document (stringified schema body).' })
  @IsString()
  @MinLength(2)
  document!: string;
}

export class ApproveProposalDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  digest!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  selected_actions!: string[];
}

export class CreateMemoryDto {
  @ApiProperty({
    enum: ['help_style', 'coaching_enabled', 'timezone', 'work_hours', 'estimate_learning_enabled'],
  })
  @IsIn(['help_style', 'coaching_enabled', 'timezone', 'work_hours', 'estimate_learning_enabled'])
  kind!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  value!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  source_message_id!: string;
}
