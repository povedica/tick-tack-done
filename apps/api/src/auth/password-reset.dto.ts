import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({ required: false, enum: ['es', 'en'] })
  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: 'es' | 'en';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captcha_token?: string;
}

export class PasswordResetAcceptedDto {
  @ApiProperty({ enum: ['accepted'] })
  status!: 'accepted';
}

export class PasswordResetVerifyDto {
  @ApiProperty({ minLength: 43, maxLength: 64 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,64}$/)
  token!: string;
}

export class PasswordResetVerifyResponseDto {
  @ApiProperty()
  valid!: true;

  @ApiProperty()
  totp_required!: boolean;

  @ApiProperty()
  expires_at!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ minLength: 43, maxLength: 64 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,64}$/)
  token!: string;

  @ApiProperty({ minLength: 10, maxLength: 200 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  new_password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  totp_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recovery_code?: string;
}
