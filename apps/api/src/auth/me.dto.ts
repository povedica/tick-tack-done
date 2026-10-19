import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteMeDto {
  @ApiProperty({ description: 'Must equal the account email' })
  @IsString()
  @MaxLength(200)
  confirmation!: string;

  @ApiProperty({ description: 'Current password' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  totp_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recovery_code?: string;
}

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

export class InboundEmailStatusDto {
  @ApiProperty()
  active!: boolean;
}

export class InboundEmailAddressDto {
  @ApiProperty({ description: 'Shown once. The secret is not stored in clear text.' })
  address!: string;

  @ApiProperty()
  token!: string;
}

export class MeResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String })
  display_name!: string;

  @ApiProperty({ type: String })
  time_zone!: string;

  @ApiProperty({ type: String })
  locale!: string;

  @ApiProperty({ enum: ['ask', 'complete', 'leave'] })
  task_complete_children!: 'ask' | 'complete' | 'leave';

  @ApiProperty({ nullable: true, type: String })
  daily_reminder_time!: string | null;
}
