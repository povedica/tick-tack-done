import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_REMINDER_TRIGGERS } from '@reflexionia/domain';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const REMINDER_CHOICES = [...ACCOUNT_REMINDER_TRIGGERS];

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

  @ApiProperty({ required: false, enum: ['auto', 'es', 'en'] })
  @IsOptional()
  @IsIn(['auto', 'es', 'en'])
  locale?: 'auto' | 'es' | 'en';

  @ApiProperty({ required: false, enum: ['monday', 'sunday'] })
  @IsOptional()
  @IsIn(['monday', 'sunday'])
  week_start?: 'monday' | 'sunday';

  @ApiProperty({ required: false, enum: ['light', 'dark', 'auto'] })
  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  theme?: 'light' | 'dark' | 'auto';

  @ApiProperty({ required: false, enum: ['auto', 'es', 'en'] })
  @IsOptional()
  @IsIn(['auto', 'es', 'en'])
  nlp_language?: 'auto' | 'es' | 'en';

  @ApiProperty({ required: false, enum: ['comfortable', 'compact'] })
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: 'comfortable' | 'compact';

  @ApiProperty({
    required: false,
    enum: ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'],
  })
  @IsOptional()
  @IsIn(['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'])
  accent?: 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';

  @ApiProperty({ required: false, nullable: true, enum: REMINDER_CHOICES })
  @IsOptional()
  @IsIn(REMINDER_CHOICES)
  default_reminder_trigger?: (typeof REMINDER_CHOICES)[number] | null;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  current_password!: string;

  @ApiProperty({ minLength: 10, maxLength: 200 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  new_password!: string;
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

  @ApiProperty({ enum: ['auto', 'es', 'en'] })
  locale!: 'auto' | 'es' | 'en';

  @ApiProperty({ enum: ['ask', 'complete', 'leave'] })
  task_complete_children!: 'ask' | 'complete' | 'leave';

  @ApiProperty({ nullable: true, type: String })
  daily_reminder_time!: string | null;

  @ApiProperty({ enum: ['monday', 'sunday'] })
  week_start!: 'monday' | 'sunday';

  @ApiProperty({ enum: ['light', 'dark', 'auto'] })
  theme!: 'light' | 'dark' | 'auto';

  @ApiProperty({ enum: ['auto', 'es', 'en'] })
  nlp_language!: 'auto' | 'es' | 'en';

  @ApiProperty({ enum: ['comfortable', 'compact'] })
  density!: 'comfortable' | 'compact';

  @ApiProperty({ enum: ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'] })
  accent!: 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';

  @ApiProperty({ nullable: true, type: String })
  default_reminder_trigger!: string | null;
}
