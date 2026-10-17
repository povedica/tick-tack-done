import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  display_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  time_zone?: string;

  @ApiProperty({ required: false, enum: ['ask', 'complete', 'leave'] })
  @IsOptional()
  @IsIn(['ask', 'complete', 'leave'])
  task_complete_children?: 'ask' | 'complete' | 'leave';
}

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  display_name!: string;

  @ApiProperty()
  time_zone!: string;

  @ApiProperty()
  locale!: string;

  @ApiProperty({ enum: ['ask', 'complete', 'leave'] })
  task_complete_children!: 'ask' | 'complete' | 'leave';
}
