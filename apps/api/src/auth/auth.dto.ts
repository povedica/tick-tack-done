import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 200 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  display_name!: string;
}

export class RegistrationStatusDto {
  @ApiProperty()
  open!: boolean;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty()
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
  @MaxLength(20)
  recovery_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captcha_token?: string;
}

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  display_name!: string;

  @ApiProperty()
  csrf_token!: string;
}

export class SessionListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  last_used_at!: string;

  @ApiProperty({ nullable: true })
  user_agent!: string | null;

  @ApiProperty()
  current!: boolean;
}
