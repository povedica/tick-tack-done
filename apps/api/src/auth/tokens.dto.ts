import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { API_SCOPES } from './scopes.js';

const SCOPE_VALUES: string[] = [...API_SCOPES];

export class CreateTokenDto {
  @ApiProperty({ required: false, nullable: true, enum: [30, 90, 365] })
  @IsOptional()
  @IsIn([30, 90, 365, null])
  expires_in_days?: number | null;

  @ApiProperty({
    minLength: 1,
    maxLength: 80,
    description: 'Agent or script this token belongs to',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: SCOPE_VALUES, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(SCOPE_VALUES.length)
  @IsIn(SCOPE_VALUES, { each: true })
  scopes!: string[];
}

export class TokenDto {
  @ApiProperty({ required: false, nullable: true, enum: ['user', 'rotated', 'reuse'] })
  revoked_reason?: 'user' | 'rotated' | 'reuse' | null;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  oauth_client_id!: string | null;

  @ApiProperty({ nullable: true, type: String })
  expires_at!: string | null;

  @ApiProperty()
  token_prefix!: string;

  @ApiProperty({ isArray: true, type: String })
  scopes!: string[];

  @ApiProperty()
  created_at!: string;

  @ApiProperty({ nullable: true, type: String })
  last_used_at!: string | null;

  @ApiProperty({ nullable: true, type: String })
  revoked_at!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'OAuth client name, when this token was issued by consent',
  })
  client_name!: string | null;
}

export class TokenCreatedDto extends TokenDto {
  @ApiProperty({ description: 'Shown once. Only the hash is stored.' })
  token!: string;
}

export class TokenPageDto {
  @ApiProperty({
    description:
      'Total matching tokens before pagination; rotated rows are excluded for status=revoked',
  })
  total!: number;

  @ApiProperty({ type: [TokenDto] })
  items!: TokenDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class ActivityEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  entity_type!: string;

  @ApiProperty()
  entity_id!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty({ type: Object })
  changes!: object;

  @ApiProperty()
  created_at!: string;

  @ApiProperty({ nullable: true, type: String })
  token_id!: string | null;
}

export class ActivityPageDto {
  @ApiProperty({ type: [ActivityEntryDto] })
  items!: ActivityEntryDto[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;
}

export class OauthGrantDto {
  @ApiProperty() client_id!: string;
  @ApiProperty() client_name!: string;
  @ApiProperty() authorized_at!: string;
  @ApiProperty({ nullable: true, type: String }) last_used_at!: string | null;
  @ApiProperty() active_access_tokens!: number;
  @ApiProperty() active_refresh_families!: number;
  @ApiProperty() renewals!: number;
  @ApiProperty({ type: [String] }) scopes!: string[];
}
export class OauthGrantPageDto {
  @ApiProperty({ type: [OauthGrantDto] }) items!: OauthGrantDto[];
}
