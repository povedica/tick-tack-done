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

  @ApiProperty({ required: false, nullable: true, example: '08:00' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  daily_reminder_time?: string | null;
}

export class PushSubscriptionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  endpoint!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  auth!: string;
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

  @ApiProperty({ nullable: true, type: String })
  daily_reminder_time!: string | null;
}
